import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { errorComms } from '../comms-http';
import { ComAlcanceCodigo } from './alcance';
import { CommsCapabilityService } from './comms-capability.service';
import { CAPABILITY_KEY } from './require-capability.decorator';

export interface CommsScope {
    capacidad: string;
    alcance: ComAlcanceCodigo;
    tiposPermitidos: string[] | null;
}

@Injectable()
export class CommsCapabilityGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly capabilities: CommsCapabilityService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requerida = this.reflector.getAllAndOverride<string | undefined>(CAPABILITY_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requerida) return true;

        const request = context.switchToHttp().getRequest<{
            user?: ActiveUserDto;
            params?: { companyId?: string };
            commsScope?: CommsScope;
        }>();
        const user = request.user;
        if (!user?.id || !user.idTenant) {
            throw errorComms(HttpStatus.FORBIDDEN, 'SIN_CAPACIDAD', 'No tienes permiso para esta acción.');
        }

        const companyId = Number(request.params?.companyId);
        const efectivas = await this.capabilities.getEffective(user, Number.isInteger(companyId) ? companyId : 0);
        const encontrada = efectivas.find((item) => item.codigo === requerida);
        if (!encontrada) {
            throw errorComms(HttpStatus.FORBIDDEN, 'SIN_CAPACIDAD', 'No tienes permiso para esta acción.');
        }

        request.commsScope = {
            capacidad: encontrada.codigo,
            alcance: encontrada.alcance,
            tiposPermitidos: encontrada.tiposPermitidos,
        };
        return true;
    }
}
