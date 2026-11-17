import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { RoleplayAccessService } from './roleplay-access.service';
import { EstatusRoleplay, resumirIntentos } from './roleplay-progress.util';

const ORDEN_ESTATUS: EstatusRoleplay[] = ['en_progreso', 'pendiente', 'aprobado', 'sin_intentos', 'vencido'];

@Injectable()
export class MyRoleplaysService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: RoleplayAccessService,
    ) { }

    async findMine(companyId: number, user: ActiveUserDto) {
        const idTenant = this.access.tenantDe(user);
        const idEmpleado = await this.access.findEmployeeId(companyId, user);
        if (!idEmpleado) {
            throw new NotFoundException('El usuario no tiene un empleado asociado en esta empresa.');
        }

        const asignaciones = await this.prisma.rolePlayAsignaciones.findMany({
            where: { idEmpleado, idEmpresa: companyId, idTenant, Activo: true, RolePlays: { Activo: true } },
            include: {
                RolePlays: {
                    select: {
                        idRolePlay: true, Titulo: true, Descripcion: true, ObjetivosAprendizaje: true,
                        DuracionMinutos: true, CalificacionMinima: true,
                        _count: { select: { EvaluationCriteria: true } },
                    },
                },
            },
        });
        if (!asignaciones.length) return [];

        const llamadas = await this.prisma.rolePlayLlamadas.findMany({
            where: { idRolePlay: { in: asignaciones.map((a) => a.idRolePlay) }, idUsuario: user.id, idEmpresa: companyId, idTenant },
            select: {
                idLlamada: true, idRolePlay: true, FechaInicio: true, FechaRegistro: true,
                RolePlayEvaluaciones: { select: { ScoreGlobal: true } },
            },
        });

        const ahora = new Date();
        return asignaciones
            .map((a) => {
                const rp = a.RolePlays;
                const minima = rp.CalificacionMinima === null ? null : Number(rp.CalificacionMinima);
                const r = resumirIntentos(llamadas.filter((l) => l.idRolePlay === a.idRolePlay), a, minima, ahora);
                const motivoNoDisponible = r.vencido
                    ? 'La fecha límite ya pasó.'
                    : r.agotado
                        ? `Usaste tus ${a.IntentosMaximos} intento(s).`
                        : null;
                return {
                    idAsignacion: a.idAsignacion,
                    idRolePlay: rp.idRolePlay,
                    titulo: rp.Titulo,
                    descripcion: rp.Descripcion,
                    objetivosAprendizaje: rp.ObjetivosAprendizaje,
                    duracionMinutos: rp.DuracionMinutos,
                    totalCriterios: rp._count.EvaluationCriteria,
                    calificacionMinima: minima,
                    fechaAsignacion: a.FechaRegistro,
                    fechaLimite: a.FechaLimite,
                    intentosMaximos: a.IntentosMaximos,
                    intentosRestantes: a.IntentosMaximos === null ? null : Math.max(0, a.IntentosMaximos - r.intentos),
                    intentos: r.intentos,
                    mejorCalificacion: r.mejorCalificacion,
                    idLlamadaMejor: r.idLlamadaMejor,
                    ultimaCalificacion: r.ultimaCalificacion,
                    idLlamadaUltima: r.idLlamadaUltima,
                    ultimoIntento: r.ultimoIntento,
                    estatus: r.estatus,
                    puedePracticar: !motivoNoDisponible,
                    motivoNoDisponible,
                };
            })
            .sort((x, y) => {
                const e = ORDEN_ESTATUS.indexOf(x.estatus) - ORDEN_ESTATUS.indexOf(y.estatus);
                if (e !== 0) return e;
                const fx = x.fechaLimite?.getTime() ?? Number.MAX_SAFE_INTEGER;
                const fy = y.fechaLimite?.getTime() ?? Number.MAX_SAFE_INTEGER;
                return fx - fy || x.titulo.localeCompare(y.titulo, 'es');
            });
    }
}
