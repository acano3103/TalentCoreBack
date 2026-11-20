import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { COMMS_EVENTO_EMPLEADO, HechoEmpleado } from 'src/common/events/comms-hechos';
import { PrismaService } from 'src/prisma/prisma.service';
import { AudienceResolverService } from '../audiences/audience-resolver.service';
import { CriteriosAudiencia, normalizarCriterios } from '../audiences/criterios';
import { AnnouncementDispatchService } from '../delivery/announcement-dispatch.service';
import { ESTADOS_ABIERTOS, MOTIVO_BAJA_PUSH, alcanceParaIncluirNuevos, hechoEmpleadoValido } from './cortes';

@Injectable()
export class CommsNewMembersService {
    private readonly logger = new Logger(CommsNewMembersService.name);
    ahora: () => Date = () => new Date();

    constructor(
        private readonly prisma: PrismaService,
        private readonly resolver: AudienceResolverService,
        private readonly dispatch: AnnouncementDispatchService,
    ) {}

    @OnEvent(COMMS_EVENTO_EMPLEADO)
    async onEmpleado(hecho: HechoEmpleado): Promise<void> {
        try {
            if (!hechoEmpleadoValido(hecho)) return;
            if (hecho.tipo === 'BAJA') {
                await this.baja(hecho);
                return;
            }
            await this.incorporar(hecho);
        } catch (error) {
            const texto = error instanceof Error ? error.message : 'Error desconocido';
            this.logger.error(`comms-new-members (${hecho?.idEmpleado ?? 'sin id'}): ${texto}`);
        }
    }

    private async incorporar(hecho: HechoEmpleado): Promise<void> {
        const ahora = this.ahora();
        const comunicados = await this.prisma.comComunicados.findMany({
            where: {
                idTenant: hecho.idTenant,
                IncluirNuevos: true,
                Estado: 'ENVIADO',
                OR: [{ VigenteHasta: null }, { VigenteHasta: { gt: ahora } }],
            },
            select: { idComunicado: true, idEmpresa: true, CriteriosAudiencia: true },
        });
        let cuantos = 0;
        for (const comunicado of comunicados) {
            const criterios = leerCriterios(comunicado.CriteriosAudiencia);
            const entra = await this.resolver.coincideConCriterios(
                hecho.idEmpleado,
                criterios,
                alcanceParaIncluirNuevos(hecho.idTenant, comunicado.idEmpresa, criterios),
            );
            if (!entra) continue;
            const creado = await this.dispatch.incorporarEmpleado(comunicado.idComunicado, hecho.idEmpleado);
            if (creado) cuantos += 1;
        }
        if (cuantos > 0) {
            this.logger.log(`comms-new-members: el empleado ${hecho.idEmpleado} entró a ${cuantos} comunicados.`);
        }
    }

    private async baja(hecho: HechoEmpleado): Promise<void> {
        const ahora = this.ahora();
        const destinatarios = await this.prisma.comDestinatarios.updateMany({
            where: { idEmpleado: hecho.idEmpleado, Estado: { in: [...ESTADOS_ABIERTOS] } },
            data: { Estado: 'EXPIRADO' },
        });
        const empleado = await this.prisma.empleados.findUnique({
            where: { idEmpleado: hecho.idEmpleado },
            select: { idUsuario: true },
        });
        const oUsuario = empleado?.idUsuario ? [{ user_uuid: empleado.idUsuario }] : [];
        const tokens = await this.prisma.pushTokens.updateMany({
            where: {
                Activo: true,
                OR: [{ idEmpleado: hecho.idEmpleado }, ...oUsuario],
            },
            data: { Activo: false, FechaBaja: ahora, MotivoBaja: MOTIVO_BAJA_PUSH },
        });
        this.logger.log(
            `comms-new-members: baja del empleado ${hecho.idEmpleado}, ${destinatarios.count} destinatarios y ${tokens.count} tokens.`,
        );
    }
}

function leerCriterios(valor: unknown): CriteriosAudiencia {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
    return normalizarCriterios(valor as CriteriosAudiencia);
}
