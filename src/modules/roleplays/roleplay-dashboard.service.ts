import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExcelColumn, ExcelExportService } from 'src/common/services/excel-export.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { RoleplayDashboardQueryDto } from './dto/roleplay-dashboard.dto';
import { resumirIntentos } from './roleplay-progress.util';

export interface RoleplayResumen {
    idRolePlay: number;
    titulo: string;
    activo: boolean;
    calificacionMinima: number | null;
    asignados: number;
    aprobados: number;
    enProgreso: number;
    pendientes: number;
    vencidos: number;
    promedio: number | null;
    cumplimiento: number;
}

const promedioDe = (valores: number[]) =>
    valores.length ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10 : null;
const porcentaje = (parte: number, total: number) => (total ? Math.round((parte / total) * 1000) / 10 : 0);

// Pestaña "Roleplays" del tablero de capacitación
@Injectable()
export class RoleplayDashboardService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly excelExportService: ExcelExportService,
    ) { }

    async summary(companyId: number, user: ActiveUserDto, q: RoleplayDashboardQueryDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant;
        const search = q.search?.trim();

        const roleplays = await this.prisma.rolePlays.findMany({
            where: { idEmpresa: companyId, idTenant, ...(search ? { Titulo: { contains: search } } : {}) },
            select: { idRolePlay: true, Titulo: true, Activo: true, CalificacionMinima: true },
            orderBy: { Titulo: 'asc' },
        });
        const ids = roleplays.map((r) => r.idRolePlay);

        // El periodo del tablero filtra por fecha de asignación (hora de México)
        const rango = {
            ...(q.desde ? { gte: new Date(`${q.desde.slice(0, 10)}T00:00:00-06:00`) } : {}),
            ...(q.hasta ? { lte: new Date(`${q.hasta.slice(0, 10)}T23:59:59-06:00`) } : {}),
        };
        const asignaciones = ids.length
            ? await this.prisma.rolePlayAsignaciones.findMany({
                where: {
                    idRolePlay: { in: ids }, idEmpresa: companyId, idTenant, Activo: true,
                    ...(q.desde || q.hasta ? { FechaRegistro: rango } : {}),
                    ...(q.idSite ? { Empleados: { idSite: q.idSite } } : {}),
                },
                select: {
                    idRolePlay: true, idEmpleado: true, FechaRegistro: true, FechaLimite: true, IntentosMaximos: true,
                    Empleados: { select: { auth_user: { select: { id: true } } } },
                },
            })
            : [];

        const idsUsuario = [...new Set(asignaciones.map((a) => a.Empleados.auth_user?.id).filter((id): id is number => !!id))];
        const llamadas = idsUsuario.length
            ? await this.prisma.rolePlayLlamadas.findMany({
                where: { idRolePlay: { in: ids }, idUsuario: { in: idsUsuario }, idEmpresa: companyId, idTenant },
                select: {
                    idLlamada: true, idRolePlay: true, idUsuario: true, FechaInicio: true, FechaRegistro: true,
                    RolePlayEvaluaciones: { select: { ScoreGlobal: true } },
                },
            })
            : [];

        const ahora = new Date();
        const mejores: number[] = [];
        const filas: RoleplayResumen[] = roleplays.map((rp) => {
            const minima = rp.CalificacionMinima === null ? null : Number(rp.CalificacionMinima);
            const resultados = asignaciones
                .filter((a) => a.idRolePlay === rp.idRolePlay)
                .map((a) => {
                    const idUsuario = a.Empleados.auth_user?.id;
                    const propias = idUsuario ? llamadas.filter((l) => l.idRolePlay === rp.idRolePlay && l.idUsuario === idUsuario) : [];
                    return resumirIntentos(propias, a, minima, ahora);
                });
            const califs = resultados.map((r) => r.mejorCalificacion).filter((c): c is number => c !== null);
            mejores.push(...califs);
            const aprobados = resultados.filter((r) => r.estatus === 'aprobado').length;
            return {
                idRolePlay: rp.idRolePlay,
                titulo: rp.Titulo,
                activo: !!rp.Activo,
                calificacionMinima: minima,
                asignados: resultados.length,
                aprobados,
                enProgreso: resultados.filter((r) => r.estatus === 'en_progreso').length,
                pendientes: resultados.filter((r) => r.estatus === 'pendiente').length,
                vencidos: resultados.filter((r) => r.estatus === 'vencido' || r.estatus === 'sin_intentos').length,
                promedio: promedioDe(califs),
                cumplimiento: porcentaje(aprobados, resultados.length),
            };
        });

        // Se muestran los activos y los inactivos que tienen asignaciones en el periodo
        const visibles = filas
            .filter((f) => f.activo || f.asignados > 0)
            .sort((a, b) => b.asignados - a.asignados || a.titulo.localeCompare(b.titulo, 'es'));

        const asignados = visibles.reduce((s, f) => s + f.asignados, 0);
        const aprobados = visibles.reduce((s, f) => s + f.aprobados, 0);
        return {
            kpis: {
                roleplaysActivos: visibles.filter((f) => f.activo).length,
                asignaciones: asignados,
                empleados: new Set(asignaciones.map((a) => a.idEmpleado)).size,
                aprobados,
                cumplimiento: porcentaje(aprobados, asignados),
                enProgreso: visibles.reduce((s, f) => s + f.enProgreso, 0),
                pendientes: visibles.reduce((s, f) => s + f.pendientes, 0),
                vencidos: visibles.reduce((s, f) => s + f.vencidos, 0),
                promedio: promedioDe(mejores),
            },
            roleplays: visibles,
        };
    }

    async export(companyId: number, user: ActiveUserDto, q: RoleplayDashboardQueryDto) {
        const { roleplays } = await this.summary(companyId, user, q);
        const columns: ExcelColumn<RoleplayResumen>[] = [
            { header: 'Roleplay', key: 'titulo', width: 40 },
            { header: 'Estatus', key: 'activo', width: 12, value: (r) => (r.activo ? 'Activo' : 'Inactivo') },
            { header: 'Asignados', key: 'asignados', width: 12 },
            { header: 'Aprobados', key: 'aprobados', width: 12 },
            { header: 'Cumplimiento (%)', key: 'cumplimiento', width: 16 },
            { header: 'En progreso', key: 'enProgreso', width: 13 },
            { header: 'Pendientes', key: 'pendientes', width: 12 },
            { header: 'Vencidos / sin intentos', key: 'vencidos', width: 22 },
            { header: 'Promedio (%)', key: 'promedio', width: 14, value: (r) => r.promedio ?? '' },
            { header: 'Mínima (%)', key: 'calificacionMinima', width: 12, value: (r) => r.calificacionMinima ?? 'Sin mínima' },
        ];
        return this.excelExportService.generate({ sheetName: 'Roleplays', columns, rows: roleplays });
    }
}
