import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { errorComms } from '../comms-http';
import { ComAlcanceCodigo } from './alcance';
import { CommsCapabilityService } from './comms-capability.service';
import { CAPABILITY_KEY } from './require-capability.decorator';

const RANGO_ALCANCE: Record<string, number> = {
    TENANT: 60,
    EMPRESAS: 50,
    UNIDADES: 40,
    UBICACIONES: 30,
    ESTRUCTURA: 20,
    EQUIPO_DIRECTO: 10,
};

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
        const pedidas = capacidadesPedidas(
            this.reflector.getAllAndOverride<string | string[] | undefined>(CAPABILITY_KEY, [
                context.getHandler(),
                context.getClass(),
            ]),
        );
        if (!pedidas.length) return true;

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
        const encontradas = pedidas
            .map((codigo) => efectivas.find((item) => item.codigo === codigo))
            .filter((item): item is NonNullable<typeof item> => item != null);
        encontradas.sort((a, b) => (RANGO_ALCANCE[b.alcance] ?? 0) - (RANGO_ALCANCE[a.alcance] ?? 0));
        const encontrada = encontradas[0];
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

function capacidadesPedidas(valor: string | string[] | undefined): string[] {
    if (typeof valor === 'string') return valor ? [valor] : [];
    if (!Array.isArray(valor)) return [];
    return valor.filter((item): item is string => typeof item === 'string' && item.length > 0);
}
