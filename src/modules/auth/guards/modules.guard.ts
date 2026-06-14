import {
    CanActivate,
    ExecutionContext,
    Injectable,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULES_KEY } from '../decorators/modules.decorator';

@Injectable()
export class ModulesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredModules = this.reflector.getAllAndOverride<string[]>(
            MODULES_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredModules) return true;

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        const hasModule = requiredModules.some((module) =>
            user.modulos.includes(module),
        );

        if (!hasModule) {
            throw new ForbiddenException('No tienes permiso para este módulo');
        }

        return true;
    }
}