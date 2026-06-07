import { Inject, Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { AuthDataService } from './queries/auth.queries';
import { AuthSuccessResponse } from './interfaces/auth-response.interface';
import { DjangoPasswordHasher } from '../common/utils/django-password.util';
import { ResendTokenDto } from './dto/resend-token.dto';
import { NotificationDispatcher } from 'src/notifications/notification.dispatcher';
import { CaptchaService } from './providers/captcha.service';
import { v4 as uuidv4 } from 'uuid';
import { ActiveUserDto } from './dto/active-user.dto';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
        private readonly jwtService: JwtService,
        private readonly dataService: AuthDataService,
        private readonly notifications: NotificationDispatcher,
        private readonly captchaService: CaptchaService
    ) { }

    async login(loginDto: LoginDto) {
        const { username, password, captchaToken, browser, forceLogin } = loginDto;

        // Validate Captcha if enabled
        const useCaptcha = this.configService.get<boolean>('USE_CAPTCHA', false);
        if (useCaptcha) {
            const isHuman = await this.captchaService.validateToken(captchaToken || '');
            if (!isHuman) {
                throw new UnauthorizedException('Validación de seguridad fallida. Intente nuevamente.');
            }
        }

        const token2fa = Math.floor(100000 + Math.random() * 900000).toString();
        const useToken2FA = this.configService.get<boolean>('USE_TOKEN_2FA', true);

        // Manejo seguro del booleano de la variable de entorno
        const allowConcurrentEnv = this.configService.get('ALLOW_CONCURRENT_SESSIONS', 'true');
        const allowConcurrent = allowConcurrentEnv === true || allowConcurrentEnv === 'true';

        // 1. System users (Staff)
        const userSystem = await this.dataService.getUserSystem(username);
        if (userSystem) {
            if (!userSystem.is_active) throw new UnauthorizedException('El usuario no está activo');

            const isPasswordValid = DjangoPasswordHasher.verify(password, userSystem.password);
            if (!isPasswordValid) throw new UnauthorizedException('La contraseña es incorrecta');

            // AGREGADO: CONTROL DE SESIÓN CONCURRENTE (STAFF)
            if (!allowConcurrent) {
                const sessionCheck = await this.handleSessionControl(userSystem.uuid, !!forceLogin);
                if (sessionCheck.conflict) {
                    return {
                        sessionConflict: true,
                        message: 'Ya tienes una sesión activa en otro dispositivo o navegador. ¿Deseas cerrarla para iniciar aquí?'
                    };
                }
            }

            if (useToken2FA) {
                await this.prisma.tokenUsuario.create({
                    data: { idUsuario: userSystem.id, token: token2fa, fechaGeneracion: new Date() }
                });
                await this.notifications.notify({
                    userUuid: userSystem.uuid,
                    notificationTypeCode: '2FA',
                    to: userSystem.email,
                    phone: userSystem.phone,
                    subject: 'Código de Verificación - Talent Core',
                    context: {
                        name: `${userSystem.first_name} ${userSystem.last_name}`,
                        token: token2fa
                    }
                })

                // Se asienta la sesión activa en DB vinculada al proceso intermedio
                await this.registerSessionInDb(userSystem.uuid, browser || 'Unknown Browser');

                return { requires2FA: true, idUsuario: userSystem.id, userType: 'staff', message: `Código enviado a: ${this.ofuscarCorreo(userSystem.email)}` };
            }

            // Registro directo de sesión si no usa 2FA
            await this.registerSessionInDb(userSystem.uuid, browser || 'Unknown Browser');
            return this.generateAuthResponse(userSystem.id, 'staff');
        }

        // 2. Recruitment users (Candidates)
        const userRec = await this.prisma.usuarios.findFirst({ where: { claveUsuario: username } });
        if (userRec) {
            if (!userRec.activo) throw new UnauthorizedException('El usuario no está activo');
            if (!userRec.password) throw new UnauthorizedException('El usuario no tiene contraseña');
            if (!userRec.idCandidato) throw new UnauthorizedException('El usuario no tiene un candidato asociado');

            let isPasswordValid = false;
            if (password === userRec.password) { isPasswordValid = true; }

            if (!isPasswordValid) throw new UnauthorizedException('La contraseña es incorrecta');

            // --- AGREGADO: CONTROL DE SESIÓN CONCURRENTE (CANDIDATO) ---
            if (!allowConcurrent) {
                const sessionCheck = await this.handleSessionControl(userRec.uuid, !!forceLogin);
                if (sessionCheck.conflict) {
                    return {
                        sessionConflict: true,
                        message: 'Ya tienes una sesión activa en otro dispositivo u navegador. ¿Deseas cerrarla para iniciar aquí?'
                    };
                }
            }

            if (useToken2FA) {
                await this.prisma.usuarios.update({
                    where: { idUsuario: userRec.idUsuario },
                    data: { token: token2fa }
                });
                const candidate = await this.prisma.candidatos.findFirst({ where: { idCandidato: userRec.idCandidato } });
                if (!candidate?.correo) throw new BadRequestException('El candidato no tiene correo registrado');

                await this.notifications.notify({
                    userUuid: userRec.uuid,
                    notificationTypeCode: '2FA',
                    to: candidate.correo,
                    phone: candidate.telefonoMovil || undefined,
                    subject: 'Código de Verificación - Talent Core',
                    context: {
                        name: `${candidate.nombre} ${candidate.primerApellido}`,
                        token: token2fa
                    }
                })

                // Se asienta la sesión activa en DB vinculada al proceso intermedio
                await this.registerSessionInDb(userRec.uuid, browser || 'Unknown Browser');

                return { requires2FA: true, idUsuario: userRec.idUsuario, userType: 'candidato', message: `Código enviado a: ${this.ofuscarCorreo(candidate.correo)}` };
            }

            // Registro directo de sesión si no usa 2FA
            await this.registerSessionInDb(userRec.uuid, browser || 'Unknown Browser');
            return this.generateAuthResponse(userRec.idUsuario, 'candidato', userRec.idCandidato);
        }

        throw new UnauthorizedException('El usuario no existe');
    }

    async logout(activeUser: ActiveUserDto) {
        if (!activeUser) {
            throw new UnauthorizedException('No se encontraron credenciales de usuario activas.');
        }

        const userId = activeUser.id;
        const userType = activeUser.roles && activeUser.roles.length > 0 ? 'staff' : 'candidato';

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
                where: { UuidUsuario: userUuid }
            });
            this.logger.log(`Sesión purgada voluntariamente en DB para el usuario con UUID: ${userUuid}`);
        }

        return { success: true, message: 'Sesión eliminada de la base de datos.' };
    }

    async verifyToken(verifyDto: VerifyTokenDto) {
        const { idUsuario, token, userType } = verifyDto;
        const expirationTime = 10 * 60 * 1000;
        const expirationDate = new Date(Date.now() - expirationTime);

        if (userType === 'staff') {
            await this.prisma.tokenUsuario.deleteMany({
                where: {
                    fechaGeneracion: {
                        lt: expirationDate,
                    },
                },
            });

            const tokenSys = await this.prisma.tokenUsuario.findFirst({
                where: { idUsuario, token },
                orderBy: { fechaGeneracion: 'desc' }
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
                where: { idUsuario, token, activo: true }
            });

            if (userRec?.idCandidato) {
                await this.prisma.usuarios.update({
                    where: { idUsuario },
                    data: { token: null }
                });
                return this.generateAuthResponse(userRec.idUsuario, 'candidato', userRec.idCandidato);
            }
        }

        throw new UnauthorizedException('Código de verificación incorrecto o expirado');
    }

    async resendToken(resetTokenDto: ResendTokenDto) {
        const { idUsuario, userType } = resetTokenDto;
        const token2fa = Math.floor(100000 + Math.random() * 900000).toString();

        if (userType === 'staff') {
            await this.prisma.tokenUsuario.deleteMany({ where: { idUsuario } });
            const userSystem = await this.prisma.auth_user.findUnique({ where: { id: idUsuario } });

            if (!userSystem || !userSystem.email) throw new BadRequestException('Usuario no válido');

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
                subject: 'Código de Verificación - Talent Core',
                context: {
                    name: `${userSystem.first_name} ${userSystem.last_name}`,
                    token: token2fa
                }
            })

            return {
                requires2FA: true,
                idUsuario,
                userType,
                message: `Código reenviado a: ${this.ofuscarCorreo(userSystem.email)}`,
            };
        }

        if (userType === 'candidato') {
            const userRec = await this.prisma.usuarios.findFirst({ where: { idUsuario, activo: true } });
            if (!userRec?.idCandidato) throw new BadRequestException('Usuario no válido');

            const candidate = await this.prisma.candidatos.findFirst({ where: { idCandidato: userRec.idCandidato } });
            if (!candidate?.correo) throw new BadRequestException('El candidato no tiene correo');

            await this.prisma.usuarios.update({
                where: { idUsuario },
                data: { token: token2fa },
            });

            await this.notifications.notify({
                userUuid: userRec.uuid,
                notificationTypeCode: '2FA',
                to: candidate.correo,
                phone: candidate.telefonoMovil || undefined,
                subject: 'Código de Verificación - Talent Core',
                context: {
                    name: `${candidate.nombre} ${candidate.primerApellido}`,
                    token: token2fa
                }
            })

            return {
                requires2FA: true,
                idUsuario,
                userType,
                message: `Código reenviado a: ${this.ofuscarCorreo(candidate.correo)}`,
            };
        }

        throw new BadRequestException('Tipo de usuario inválido');
    }

    private async generateAuthResponse(userId: number, type: 'staff' | 'candidato', idCandidato?: number): Promise<AuthSuccessResponse> {
        let userData;
        let userUuid = '';

        if (type === 'staff') {
            const user = await this.prisma.auth_user.findUnique({ where: { id: userId } });
            const fullName = `${user?.first_name} ${user?.last_name}`;
            userUuid = user?.uuid || '';
            userData = await this.dataService.getStaffData(userId, fullName);
        } else {
            const user = await this.prisma.usuarios.findFirst({ where: { idUsuario: userId } });
            userUuid = user?.uuid || '';
            userData = await this.dataService.getCandidatoData(userId, idCandidato!);
        }

        const currentSession = await this.prisma.usuarioslogin.findFirst({
            where: { UuidUsuario: userUuid },
            orderBy: { FechaLogin: 'desc' }
        });

        const payload = {
            user_id: userId,
            roles: userData.roles,
            session_id: currentSession?.identificador || null 
        };

        return {
            token: this.jwtService.sign(payload),
            user_type: type,
            userData
        };
    }

    private ofuscarCorreo(correo: string): string {
        const [name, domain] = correo.split('@');
        return `${name[0]}***${name[name.length - 1]}@${domain}`;
    }

    private async handleSessionControl(uuidUsuario: string, forceLogin: boolean): Promise<{ conflict: boolean }> {
        const existingSession = await this.prisma.usuarioslogin.findFirst({
            where: { UuidUsuario: uuidUsuario }
        });

        if (existingSession) {
            if (!forceLogin) {
                return { conflict: true };
            }
            await this.prisma.usuarioslogin.deleteMany({
                where: { UuidUsuario: uuidUsuario }
            });
        }
        return { conflict: false };
    }

    private async registerSessionInDb(uuidUsuario: string, browserString: string): Promise<void> {
        const allowConcurrentEnv = this.configService.get('ALLOW_CONCURRENT_SESSIONS', 'true');
        const allowConcurrent = allowConcurrentEnv === true || allowConcurrentEnv === 'true';

        if (!allowConcurrent) {
            await this.prisma.usuarioslogin.deleteMany({
                where: { UuidUsuario: uuidUsuario }
            });
        }

        await this.prisma.usuarioslogin.create({
            data: {
                UuidUsuario: uuidUsuario,
                FechaLogin: new Date(),
                browser: browserString,
                identificador: uuidv4() 
            }
        });
    }
}