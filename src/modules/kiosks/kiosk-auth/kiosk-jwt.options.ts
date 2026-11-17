import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';

export function kioskJwtOptions(config: ConfigService): JwtModuleOptions {
    return {
        secret: config.getOrThrow<string>('KIOSK_JWT_SECRET'),
        signOptions: { expiresIn: '365d', algorithm: 'HS256' },
    };
}
