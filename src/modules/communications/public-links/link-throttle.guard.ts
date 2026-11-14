import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { errorComms } from '../comms-http';
import { LinkThrottle } from './link-throttle';

@Injectable()
export class LinkThrottleGuard implements CanActivate {
    constructor(private readonly cupo: LinkThrottle) {}

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<{
            ip?: string;
            params?: { token?: string };
            headers?: { [key: string]: string | string[] | undefined };
        }>();
        const forwarded = req.headers?.['x-forwarded-for'];
        const desdeForward = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
        const ip = desdeForward || req.ip || 'desconocida';
        const token = String(req.params?.token ?? '');
        if (!this.cupo.permitir(ip, token)) {
            throw errorComms(HttpStatus.TOO_MANY_REQUESTS, 'LIMITE_SOLICITUDES', 'Demasiados intentos. Espera un momento.');
        }
        return true;
    }
}
