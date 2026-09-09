import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/modules/users/users.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MobileJwtStrategy extends PassportStrategy(Strategy, 'jwt-mobile') {
    constructor(
        private configService: ConfigService,
        private usersService: UsersService,
        private prisma: PrismaService,
    ) {
        super({
            // Extrae el token enviado en: Authorization: Bearer <token>
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
            algorithms: ['HS256'],
        });
    }

    async validate(payload: any) {
        const userId = payload.user_id;
        const sessionId = payload.session_id;

        if (!userId) {
            throw new UnauthorizedException('Token móvil inválido: no contiene user_id');
        }

        const user = await this.usersService.getUserBasicInfo(userId);
        if (!user) {
            throw new UnauthorizedException('Usuario no encontrado');
        }

        // Leemos la variable específica para el control de sesiones en la app móvil
        const allowConcurrentEnv = this.configService.get('MOBILE_ALLOW_CONCURRENT_SESSIONS', 'true');
        const allowConcurrent = allowConcurrentEnv === true || allowConcurrentEnv === 'true';

        if (!allowConcurrent && sessionId) {
            const activeSession = await this.prisma.usuarioslogin.findFirst({
                where: { identificador: sessionId },
            });

            if (!activeSession) {
                throw new UnauthorizedException('Tu sesión ha expirado porque se inició sesión en otro dispositivo.');
            }
        }

        // Esto se adjunta automáticamente a request.user
        return user;
    }
}