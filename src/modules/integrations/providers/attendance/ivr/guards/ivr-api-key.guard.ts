import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IvrApiKeyGuard implements CanActivate {
    constructor(private readonly configService: ConfigService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        // Leemos la cabecera x-api-key (Express normaliza las cabeceras a minúsculas)
        const clientApiKey = request.headers['x-api-key'] || request.headers['x-ivr-token'];

        if (!clientApiKey) {
            throw new UnauthorizedException(
                'Falta la cabecera de autenticación requerida (x-api-key).',
            );
        }

        const validApiKey = this.configService.get<string>('IVR_API_KEY');

        if (!validApiKey || clientApiKey !== validApiKey) {
            throw new UnauthorizedException('Token de integración IVR inválido o no autorizado.');
        }

        return true;
    }
}