import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        private usersService: UsersService
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
            algorithms: ['HS256'],
        });
    }

    async validate(payload: any) {
        const userId = payload.user_id;
        if (!userId) throw new UnauthorizedException('Token inválido');

        const user = await this.usersService.getUserFullInfo(userId);
        if (!user) throw new UnauthorizedException('Usuario no encontrado');

        return user;
    }
}