import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { DjangoPasswordHasher } from 'src/common/utils/django-password.util';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { UsersService } from 'src/modules/users/users.service';
import { MobileLoginDto } from './dto/login.dto';
import { MobileVerifyTokenDto } from './dto/verify-token.dto';
import { MobileResendTokenDto } from './dto/resend-token.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CaptchaService } from 'src/modules/auth/providers/captcha.service';
import { AuthDataService } from 'src/modules/auth/queries/auth.queries';
import { ActiveUserDto, UserFullInfoDto } from 'src/modules/auth/dto/active-user.dto';

@Injectable()
export class MobileAuthService {
    private readonly logger = new Logger(MobileAuthService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
        private readonly jwtService: JwtService,
        private readonly dataService: AuthDataService,
        private readonly notifications: NotificationDispatcher,
        private readonly captchaService: CaptchaService,
        private readonly userService: UsersService,
    ) { }

    async login(loginDto: MobileLoginDto) {
        const { username, password, captchaToken, browser, forceLogin } = loginDto;

        // 1. Manejo seguro de variables de entorno específicas para MÓVIL
        const useCaptchaEnv = this.configService.get('MOBILE_USE_CAPTCHA', 'false');
        const useCaptcha = useCaptchaEnv === true || useCaptchaEnv === 'true';

        const useToken2FAEnv = this.configService.get('MOBILE_USE_TOKEN_2FA', 'false');
        const useToken2FA = useToken2FAEnv === true || useToken2FAEnv === 'true';

        const allowConcurrentEnv = this.configService.get('MOBILE_ALLOW_CONCURRENT_SESSIONS', 'true');
        const allowConcurrent = allowConcurrentEnv === true || allowConcurrentEnv === 'true';

        // 2. Validación de Captcha si está activo para móvil
        if (useCaptcha) {
            const isHuman = await this.captchaService.validateToken(captchaToken || '');
            if (!isHuman) {
                throw new UnauthorizedException('Validación de seguridad fallida. Intente nuevamente.');
            }
        }

        // 3. Obtención y validación del usuario Staff en auth_user
        const userSystem = await this.dataService.getUserSystem(username);
        if (!userSystem) {
            throw new UnauthorizedException('El usuario no existe o las credenciales son inválidas');
        }

        if (!userSystem.is_active) {
            throw new UnauthorizedException('El usuario no está activo');
        }

        const isPasswordValid = DjangoPasswordHasher.verify(password, userSystem.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('La contraseña es incorrecta');
        }

        // 4. Control de sesiones concurrentes específico para móvil
        if (!allowConcurrent) {
            const sessionCheck = await this.handleSessionControl(userSystem.uuid, !!forceLogin);
            if (sessionCheck.conflict) {
                return {
                    sessionConflict: true,
                    message: 'Ya tienes una sesión activa en otro dispositivo. ¿Deseas cerrarla para iniciar aquí?',
                };
            }
        }

        // 5. Autenticación de Dos Factores (2FA) si está activo para móvil
        if (useToken2FA) {
            const token2fa = Math.floor(100000 + Math.random() * 900000).toString();

            await this.prisma.tokenUsuario.create({
                data: {
                    idUsuario: userSystem.id,
                    token: token2fa,
                    fechaGeneracion: new Date(),
                },
            });

            await this.notifications.notify({
                userUuid: userSystem.uuid,
                notificationTypeCode: '2FA',
                to: userSystem.email,
                phone: userSystem.phone,
                subject: 'Código de Verificación Móvil - Talent Core',
                context: {
                    name: `${userSystem.first_name} ${userSystem.last_name}`,
                    token: token2fa,
                },
            });

            await this.registerSessionInDb(userSystem.uuid, browser || 'Mobile Device');

            return {
                requires2FA: true,
                idUsuario: userSystem.id,
                userType: 'staff',
                message: `Código enviado a: ${this.ofuscarCorreo(userSystem.email)}`,
            };
        }

        // 6. Registro de sesión y emisión de respuesta JWT
        await this.registerSessionInDb(userSystem.uuid, browser || 'Mobile Device');
        return this.generateAuthResponse(userSystem.id, 'staff');
    }

    async verifyToken(verifyDto: MobileVerifyTokenDto) {
        const { idUsuario, token, userType } = verifyDto;
        const expirationTime = 10 * 60 * 1000; // 10 minutos
        const expirationDate = new Date(Date.now() - expirationTime);

        if (userType === 'staff') {
            await this.prisma.tokenUsuario.deleteMany({
                where: {
                    fechaGeneracion: { lt: expirationDate },
                },
            });

            const tokenSys = await this.prisma.tokenUsuario.findFirst({
                where: { idUsuario, token },
                orderBy: { fechaGeneracion: 'desc' },
            });

            if (tokenSys?.fechaGeneracion) {
                if (new Date().getTime() - tokenSys.fechaGeneracion.getTime() > expirationTime) {
                    throw new UnauthorizedException('El código ha expirado');
                }

                await this.prisma.tokenUsuario.delete({ where: { id: tokenSys.id } });
                return this.generateAuthResponse(idUsuario, 'staff');
            }
        } else if (userType === 'candidato') {
            const userRec = await this.prisma.usuarios.findFirst({
                where: { idUsuario, token, activo: true },
            });

            if (userRec?.idCandidato) {
                await this.prisma.usuarios.update({
                    where: { idUsuario },
                    data: { token: null },
                });
                return this.generateAuthResponse(userRec.idUsuario, 'candidato', userRec.idCandidato);
            }
        }

        throw new UnauthorizedException('Código de verificación incorrecto o expirado');
    }

    async resendToken(resendDto: MobileResendTokenDto) {
        const { idUsuario, userType } = resendDto;
        const token2fa = Math.floor(100000 + Math.random() * 900000).toString();

        if (userType === 'staff') {
            await this.prisma.tokenUsuario.deleteMany({ where: { idUsuario } });
            const userSystem = await this.prisma.auth_user.findUnique({ where: { id: idUsuario } });

            if (!userSystem || !userSystem.email) {
                throw new BadRequestException('Usuario no válido');
            }

            await this.prisma.tokenUsuario.create({
                data: {
                    idUsuario,
                    token: token2fa,
                    fechaGeneracion: new Date(),
                },
            });

            await this.notifications.notify({
                userUuid: userSystem.uuid,
                notificationTypeCode: '2FA',
                to: userSystem.email,
                phone: userSystem.phone || undefined,
                subject: 'Código de Verificación Móvil - Talent Core',
                context: {
                    name: `${userSystem.first_name} ${userSystem.last_name}`,
                    token: token2fa,
                },
            });

            return {
                requires2FA: true,
                idUsuario,
                userType,
                message: `Código reenviado a: ${this.ofuscarCorreo(userSystem.email)}`,
            };
        }

        throw new BadRequestException('Tipo de usuario no soportado');
    }

    async logout(activeUser: ActiveUserDto) {
        if (!activeUser) {
            throw new UnauthorizedException('No se encontraron credenciales de usuario activas.');
        }

        const user: UserFullInfoDto = await this.userService.getUserFullInfo(activeUser.id);
        const userId = activeUser.id;
        const userType = user.roles && user.roles.length > 0 ? 'staff' : 'candidato';
        let userUuid = '';

        if (userType === 'staff') {
            const userDb = await this.prisma.auth_user.findUnique({ where: { id: userId } });
            userUuid = userDb?.uuid || '';
        } else {
            const userDb = await this.prisma.usuarios.findFirst({ where: { idUsuario: userId } });
            userUuid = userDb?.uuid || '';
        }

        if (userUuid) {
            await this.prisma.usuarioslogin.deleteMany({
                where: { UuidUsuario: userUuid },
            });
        }

        return { success: true, message: 'Sesión móvil eliminada correctamente.' };
    }

    private async generateAuthResponse(userId: number, type: 'staff' | 'candidato', idCandidato?: number) {
        let userData: any;
        let userUuid = '';
        let isSuperuser = false;
        let idTenant: number | null = null;

        if (type === 'staff') {
            const user = await this.prisma.auth_user.findUnique({ where: { id: userId } });
            const fullName = `${user?.first_name} ${user?.last_name}`;
            userUuid = user?.uuid || '';
            isSuperuser = Boolean(user?.is_superuser);
            idTenant = (user as any)?.idTenant || null;

            userData = await this.dataService.getStaffData(userId, fullName);
            userData.is_superuser = isSuperuser;
            userData.idTenant = idTenant;
        } else {
            const user = await this.prisma.usuarios.findFirst({ where: { idUsuario: userId } });
            userUuid = user?.uuid || '';
            userData = await this.dataService.getCandidatoData(userId, idCandidato!);
        }

        const currentSession = await this.prisma.usuarioslogin.findFirst({
            where: { UuidUsuario: userUuid },
            orderBy: { FechaLogin: 'desc' },
        });

        // Mismo payload que usa tu JWT web para mantener compatibilidad
        const payload = {
            user_id: userId,
            roles: userData.roles,
            session_id: currentSession?.identificador || null,
            is_superuser: isSuperuser,
            idTenant: idTenant,
        };

        return {
            token: this.jwtService.sign(payload),
            user_type: type,
            userData,
        };
    }

    private ofuscarCorreo(correo: string): string {
        const [name, domain] = correo.split('@');
        return `${name[0]}***${name[name.length - 1]}@${domain}`;
    }

    private async handleSessionControl(uuidUsuario: string, forceLogin: boolean): Promise<{ conflict: boolean }> {
        const existingSession = await this.prisma.usuarioslogin.findFirst({
            where: { UuidUsuario: uuidUsuario },
        });

        if (existingSession) {
            if (!forceLogin) {
                return { conflict: true };
            }
            await this.prisma.usuarioslogin.deleteMany({
                where: { UuidUsuario: uuidUsuario },
            });
        }
        return { conflict: false };
    }

    private async registerSessionInDb(uuidUsuario: string, browserString: string): Promise<void> {
        const allowConcurrentEnv = this.configService.get('MOBILE_ALLOW_CONCURRENT_SESSIONS', 'true');
        const allowConcurrent = allowConcurrentEnv === true || allowConcurrentEnv === 'true';

        if (!allowConcurrent) {
            await this.prisma.usuarioslogin.deleteMany({
                where: { UuidUsuario: uuidUsuario },
            });
        }

        await this.prisma.usuarioslogin.create({
            data: {
                UuidUsuario: uuidUsuario,
                FechaLogin: new Date(),
                browser: browserString,
                identificador: uuidv4(),
            },
        });
    }
}