import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ArtemisApiKeyGuard implements CanActivate {
    constructor(private readonly configService: ConfigService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['x-api-key']; // O el header que acuerden

        if (!apiKey) {
            throw new UnauthorizedException('API Key no proporcionada');
        }

        const apiToken = this.configService.get<string>('WORKFORCE_MANAGEMENT_API_KEY');

        if (apiToken !== apiKey) {
            throw new UnauthorizedException('API Key inválida o inactiva');
        }

        return true;
    }
}