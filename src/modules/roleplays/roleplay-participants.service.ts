import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { AssignRoleplayParticipantsDto } from './dto/assign-roleplay-participants.dto';
import { UpdateRoleplayParticipantDto } from './dto/update-roleplay-participant.dto';

export type EstatusRoleplay = 'pendiente' | 'en_progreso' | 'aprobado' | 'vencido' | 'sin_intentos';

interface Intento {
    idLlamada: number;
    fecha: Date | null;
    registro: Date | null;
    porcentaje: number | null;
}

@Injectable()
export class RoleplayParticipantsService {
    private readonly logger = new Logger(RoleplayParticipantsService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAll(companyId: number, roleplayId: number, user: ActiveUserDto) {
        const idTenant = this.tenantDe(user);
        const roleplay = await this.getRoleplay(companyId, roleplayId, idTenant);
        const minima = roleplay.CalificacionMinima === null ? null : Number(roleplay.CalificacionMinima);

        const asignaciones = await this.prisma.rolePlayAsignaciones.findMany({
            where: { idRolePlay: roleplayId, idEmpresa: companyId, idTenant, Activo: true },
            include: {
                Empleados: {
                    select: {
                        idEmpleado: true, numeroEmpleado: true, nombre: true, primerApellido: true,
                        segundoApellido: true, activo: true, auth_user: { select: { id: true } },
                    },
                },
            },
        });

        // Las llamadas se guardan por usuario (auth_user.id), no por empleado
        const idsUsuario = asignaciones.map((a) => a.Empleados.auth_user?.id).filter((id): id is number => !!id);
        const llamadas = idsUsuario.length
            ? await this.prisma.rolePlayLlamadas.findMany({
                where: { idRolePlay: roleplayId, idEmpresa: companyId, idTenant, idUsuario: { in: idsUsuario } },
                select: {
                    idLlamada: true, idUsuario: true, FechaInicio: true, FechaRegistro: true,
                    RolePlayEvaluaciones: { select: { ScoreGlobal: true } },
                },
                orderBy: { idLlamada: 'asc' },
            })
            : [];

        const intentosPorUsuario = new Map<number, Intento[]>();
        for (const l of llamadas) {
            const ev = l.RolePlayEvaluaciones;
            // ScoreGlobal ya viene en porcentaje (0-100)
            const intento: Intento = {
                idLlamada: l.idLlamada,
                fecha: l.FechaInicio ?? l.FechaRegistro,
                registro: l.FechaRegistro,
                porcentaje: ev ? Math.min(100, Math.round(Number(ev.ScoreGlobal) * 10) / 10) : null,
            };
            intentosPorUsuario.set(l.idUsuario, [...(intentosPorUsuario.get(l.idUsuario) ?? []), intento]);
        }

        const ahora = new Date();
        const participantes = asignaciones
            .map((a) => {
                const e = a.Empleados;
                // Solo cuentan los intentos hechos desde que se asignó
                const intentos = ((e.auth_user && intentosPorUsuario.get(e.auth_user.id)) || [])
                    .filter((i) => !a.FechaRegistro || !i.registro || i.registro >= a.FechaRegistro);
                const evaluados = intentos.filter((i) => i.porcentaje !== null);
                const mejor = evaluados.reduce<Intento | null>((m, i) => (!m || i.porcentaje! > m.porcentaje! ? i : m), null);
                const ultimo = evaluados[evaluados.length - 1] ?? null;
                return {
                    idAsignacion: a.idAsignacion,
                    idEmpleado: e.idEmpleado,
                    numeroEmpleado: e.numeroEmpleado,
                    empleado: [e.nombre, e.primerApellido, e.segundoApellido].filter(Boolean).join(' ').trim(),
                    empleadoActivo: e.activo,
                    tieneUsuario: !!e.auth_user,
                    fechaAsignacion: a.FechaRegistro,
                    fechaLimite: a.FechaLimite,
                    intentosMaximos: a.IntentosMaximos,
                    intentos: intentos.length,
                    mejorCalificacion: mejor?.porcentaje ?? null,
                    idLlamadaMejor: mejor?.idLlamada ?? null,
                    ultimaCalificacion: ultimo?.porcentaje ?? null,
                    idLlamadaUltima: ultimo?.idLlamada ?? null,
                    ultimoIntento: intentos[intentos.length - 1]?.fecha ?? null,
                    estatus: this.estatusDe(a.FechaLimite, a.IntentosMaximos, intentos.length, mejor?.porcentaje ?? null, minima, ahora),
                };
            })
            .sort((x, y) => x.empleado.localeCompare(y.empleado, 'es'));

        const calificaciones = participantes.map((p) => p.mejorCalificacion).filter((c): c is number => c !== null);
        const resumen: Record<string, number | null> = {
            total: participantes.length,
            promedio: calificaciones.length ? Math.round((calificaciones.reduce((s, c) => s + c, 0) / calificaciones.length) * 10) / 10 : null,
        };
        for (const est of ['pendiente', 'en_progreso', 'aprobado', 'vencido', 'sin_intentos'] as EstatusRoleplay[]) {
            resumen[est] = participantes.filter((p) => p.estatus === est).length;
        }

        return {
            roleplay: { idRolePlay: roleplay.idRolePlay, Titulo: roleplay.Titulo, CalificacionMinima: minima },
            participantes,
            resumen,
        };
    }

    async assign(companyId: number, roleplayId: number, dto: AssignRoleplayParticipantsDto, user: ActiveUserDto) {
        const idTenant = this.tenantDe(user);
        const roleplay = await this.getRoleplay(companyId, roleplayId, idTenant);
        if (!roleplay.Activo) {
            throw new BadRequestException('No se pueden asignar empleados a un role play inactivo.');
        }

        const ids = [...new Set(dto.empleadosIds)];
        const empleados = await this.prisma.empleados.findMany({
            where: { idEmpleado: { in: ids }, idEmpresa: companyId, idTenant, activo: true },
            select: { idEmpleado: true },
        });
        if (empleados.length !== ids.length) {
            throw new BadRequestException('Algunos empleados no existen, están inactivos o no pertenecen a la empresa.');
        }

        const fechaLimite = this.fechaLimiteDe(dto.FechaLimite);
        const intentosMaximos = dto.IntentosMaximos ?? null;
        const existentes = await this.prisma.rolePlayAsignaciones.findMany({
            where: { idRolePlay: roleplayId, idEmpleado: { in: ids } },
            select: { idAsignacion: true, idEmpleado: true, Activo: true },
        });
        const yaAsignados = existentes.filter((x) => x.Activo).map((x) => x.idEmpleado);
        const reactivar = existentes.filter((x) => !x.Activo).map((x) => x.idAsignacion);
        const nuevos = ids.filter((id) => !existentes.some((x) => x.idEmpleado === id));

        try {
            await this.prisma.$transaction(async (tx) => {
                if (nuevos.length) {
                    await tx.rolePlayAsignaciones.createMany({
                        data: nuevos.map((idEmpleado) => ({
                            idRolePlay: roleplayId, idEmpleado, idTenant, idEmpresa: companyId,
                            FechaLimite: fechaLimite, IntentosMaximos: intentosMaximos,
                            idUsuarioAsigno: user.id, FechaRegistro: new Date(),
                        })),
                    });
                }
                if (reactivar.length) {
                    await tx.rolePlayAsignaciones.updateMany({
                        where: { idAsignacion: { in: reactivar } },
                        data: { Activo: true, FechaLimite: fechaLimite, IntentosMaximos: intentosMaximos, idUsuarioAsigno: user.id, FechaActualizacion: new Date() },
                    });
                }
                const total = nuevos.length + reactivar.length;
                if (total) {
                    await this.registrarHistorial(tx, companyId, roleplayId, 'CREAR', `${total} empleado(s) asignado(s) al role play "${roleplay.Titulo}"`, user);
                }
            });
        } catch (error: any) {
            this.logger.error(`Error al asignar participantes al role play ${roleplayId}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error interno al asignar los participantes.');
        }

        return {
            asignados: nuevos.length + reactivar.length,
            yaAsignados: yaAsignados.length,
            message: yaAsignados.length
                ? `Se asignaron ${nuevos.length + reactivar.length} empleado(s); ${yaAsignados.length} ya estaban asignados.`
                : `Se asignaron ${nuevos.length + reactivar.length} empleado(s).`,
        };
    }

    async update(companyId: number, roleplayId: number, assignmentId: number, dto: UpdateRoleplayParticipantDto, user: ActiveUserDto) {
        const idTenant = this.tenantDe(user);
        const roleplay = await this.getRoleplay(companyId, roleplayId, idTenant);
        const asignacion = await this.getAsignacion(companyId, roleplayId, assignmentId, idTenant);

        const data: Record<string, unknown> = { FechaActualizacion: new Date() };
        if (dto.FechaLimite !== undefined) data.FechaLimite = this.fechaLimiteDe(dto.FechaLimite);
        if (dto.IntentosMaximos !== undefined) data.IntentosMaximos = dto.IntentosMaximos;

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.rolePlayAsignaciones.update({ where: { idAsignacion: asignacion.idAsignacion }, data });
                await this.registrarHistorial(tx, companyId, roleplayId, 'EDITAR', `Límites de ${this.nombreDe(asignacion.Empleados)} actualizados en el role play "${roleplay.Titulo}"`, user);
            });
        } catch (error: any) {
            this.logger.error(`Error al actualizar la asignación ${assignmentId}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error interno al actualizar el participante.');
        }
        return { success: true, message: 'Participante actualizado correctamente.' };
    }

    async remove(companyId: number, roleplayId: number, assignmentId: number, user: ActiveUserDto) {
        const idTenant = this.tenantDe(user);
        const roleplay = await this.getRoleplay(companyId, roleplayId, idTenant);
        const asignacion = await this.getAsignacion(companyId, roleplayId, assignmentId, idTenant);

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.rolePlayAsignaciones.update({
                    where: { idAsignacion: asignacion.idAsignacion },
                    data: { Activo: false, FechaActualizacion: new Date() },
                });
                await this.registrarHistorial(tx, companyId, roleplayId, 'DESACTIVAR', `${this.nombreDe(asignacion.Empleados)} fue quitado del role play "${roleplay.Titulo}"`, user);
            });
        } catch (error: any) {
            this.logger.error(`Error al quitar la asignación ${assignmentId}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error interno al quitar el participante.');
        }
        return { success: true, message: 'Participante quitado correctamente.' };
    }

    // Aprobado gana a todo; luego vencido y sin intentos bloquean
    private estatusDe(fechaLimite: Date | null, intentosMax: number | null, intentos: number, mejor: number | null, minima: number | null, ahora: Date): EstatusRoleplay {
        if (mejor !== null && (minima === null || mejor >= minima)) return 'aprobado';
        if (fechaLimite && ahora > fechaLimite) return 'vencido';
        if (intentosMax !== null && intentos >= intentosMax) return 'sin_intentos';
        return intentos > 0 ? 'en_progreso' : 'pendiente';
    }

    // "YYYY-MM-DD" se toma hasta el final de ese día
    private fechaLimiteDe(valor?: string | null): Date | null {
        if (!valor) return null;
        return new Date(valor.length === 10 ? `${valor}T23:59:59` : valor);
    }

    private tenantDe(user: ActiveUserDto): number {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        return user.idTenant;
    }

    private async getRoleplay(companyId: number, roleplayId: number, idTenant: number) {
        const roleplay = await this.prisma.rolePlays.findFirst({
            where: { idRolePlay: roleplayId, idEmpresa: companyId, idTenant },
            select: { idRolePlay: true, Titulo: true, Activo: true, CalificacionMinima: true },
        });
        if (!roleplay) {
            throw new NotFoundException(`Role play con id ${roleplayId} no encontrado.`);
        }
        return roleplay;
    }

    private async getAsignacion(companyId: number, roleplayId: number, assignmentId: number, idTenant: number) {
        const asignacion = await this.prisma.rolePlayAsignaciones.findFirst({
            where: { idAsignacion: assignmentId, idRolePlay: roleplayId, idEmpresa: companyId, idTenant, Activo: true },
            include: { Empleados: { select: { nombre: true, primerApellido: true, segundoApellido: true } } },
        });
        if (!asignacion) {
            throw new NotFoundException('El participante no está asignado a este role play.');
        }
        return asignacion;
    }

    private nombreDe(e: { nombre: string | null; primerApellido: string | null; segundoApellido: string | null }) {
        return [e.nombre, e.primerApellido, e.segundoApellido].filter(Boolean).join(' ').trim() || 'Empleado';
    }

    private async registrarHistorial(tx: any, companyId: number, roleplayId: number, accion: string, texto: string, user: ActiveUserDto) {
        const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `Usuario #${user.id}`;
        await tx.historicoMovimientos.create({
            data: {
                idUsuario: user.id,
                idEmpresa: companyId,
                accion,
                tablaOrigen: 'RolePlays',
                idRegistro: String(roleplayId),
                descripcion: `${texto} por ${userFullName}`,
                fechaCreacion: new Date(),
            },
        });
    }
}
