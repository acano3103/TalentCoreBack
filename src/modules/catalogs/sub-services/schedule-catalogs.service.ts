import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateScheduleCatalogDto } from '../dto/create-schedule-catalog.dto';

@Injectable()
export class ScheduleCatalogsService {
    private readonly logger = new Logger(ScheduleCatalogsService.name);

    constructor(private readonly prisma: PrismaService) { }

    // Helper para convertir strings de hora ('09:00:00' o '09:00') a Date para la columna MySQL TIME en Prisma
    private parseTimeStringToDate(timeStr: string): Date {
        const parts = timeStr.trim().split(':');
        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        const seconds = parseInt(parts[2], 10) || 0;

        // Prisma maneja tipos TIME de MySQL como objetos Date (fecha base 1970-01-01 en UTC)
        return new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds));
    }

    // Helper para devolver estrictamente el formato 'HH:mm:ss' (24 hrs)
    private formatTimeToHHmmss(timeValue: Date | string | null): string | null {
        if (!timeValue) return null;

        if (typeof timeValue === 'string') {
            // Si ya viene como string '09:00:00'
            const parts = timeValue.split(':');
            if (parts.length >= 2) {
                const h = parts[0].padStart(2, '0');
                const m = parts[1].padStart(2, '0');
                const s = (parts[2] || '00').padStart(2, '0');
                return `${h}:${m}:${s}`;
            }
            return timeValue;
        }

        const d = new Date(timeValue);
        // Usamos getUTCHours/Minutes/Seconds porque Prisma guarda las columnas TIME en UTC 1970-01-01
        const h = String(d.getUTCHours()).padStart(2, '0');
        const m = String(d.getUTCMinutes()).padStart(2, '0');
        const s = String(d.getUTCSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    // Crear catálogo de horario (inserta todos los días asociados al nombre)
    async createSchedule(
        activeUser: ActiveUserDto,
        dto: CreateScheduleCatalogDto,
    ) {
        const user = await this.prisma.auth_user.findUnique({
            where: { id: activeUser.id },
            select: { idTenant: true, uuid: true },
        });

        if (!user) throw new NotFoundException('No se encontró el usuario');
        if (!user.idTenant) throw new BadRequestException('El usuario no tiene un tenant asignado');

        const idTenant = user.idTenant;
        const nombreNormalizado = dto.nombre.trim();

        // 1. Validar que no exista ya un horario activo con el mismo nombre en la empresa
        const existe = await this.prisma.catHorarios.findFirst({
            where: {
                idTenant,
                Nombre: nombreNormalizado,
                Activo: true,
            },
            select: { idHorario: true },
        });

        if (existe) {
            throw new BadRequestException(
                `Ya existe un horario activo registrado con el nombre "${nombreNormalizado}".`,
            );
        }

        // 2. Validar que no se repitan días en el mismo payload
        const diasSet = new Set<string>();
        for (const d of dto.dias) {
            if (diasSet.has(d.diaSemana)) {
                throw new BadRequestException(
                    `El día "${d.diaSemana}" está duplicado en la configuración del horario.`,
                );
            }
            diasSet.add(d.diaSemana);
        }

        try {
            // 3. Inserción masiva de los días de este horario
            await this.prisma.$transaction(async (tx) => {
                const registros = dto.dias.map((d) => ({
                    idTenant,
                    Nombre: nombreNormalizado,
                    DiaSemana: d.diaSemana,
                    HoraEntrada: this.parseTimeStringToDate(d.horaEntrada),
                    HoraSalida: this.parseTimeStringToDate(d.horaSalida),
                    Activo: true,
                    UsuarioRegistro: user.uuid,
                }));

                await tx.catHorarios.createMany({
                    data: registros,
                });
            });

            return {
                success: true,
                message: 'Horario creado exitosamente en el catálogo.',
                nombre: nombreNormalizado,
                totalDiasConfigurados: dto.dias.length,
            };
        } catch (error: any) {
            this.logger.error(`Error al crear horario: ${error.message}`);
            throw new InternalServerErrorException(
                `Error al guardar el horario en base de datos: ${error.message}`,
            );
        }
    }

    /**
     * Obtener horarios paginados agrupados por Nombre
     */
    async findAllSchedules(
        activeUser: ActiveUserDto,
        page: number,
        limit: number,
        search: string,
    ) {
        const user = await this.prisma.auth_user.findUnique({
            where: { id: activeUser.id },
            select: { idTenant: true },
        });

        if (!user) throw new NotFoundException('No se encontró el usuario');
        if (!user.idTenant) throw new BadRequestException('El usuario no tiene un tenant asignado');

        const idTenant = user.idTenant;
        const skip = (page - 1) * limit;

        // Filtro base: activo, tenant y empresa
        const baseWhere: any = {
            idTenant,
            Activo: true,
        };

        if (search && search.trim() !== '') {
            baseWhere.Nombre = { contains: search.trim() };
        }

        try {
            // 1. Obtener los nombres únicos de horarios paginados
            const grupos = await this.prisma.catHorarios.groupBy({
                by: ['Nombre'],
                where: baseWhere,
                orderBy: {
                    Nombre: 'asc', // <-- Obligatorio al usar skip/take en groupBy
                },
                skip,
                take: limit,
            });

            // Total de nombres únicos para la paginación
            const totalGrupos = await this.prisma.catHorarios.groupBy({
                by: ['Nombre'],
                where: baseWhere,
            });
            const total = totalGrupos.length;

            if (grupos.length === 0) {
                return {
                    data: [],
                    meta: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit) || 1,
                    },
                };
            }

            // 2. Traer los días detallados para los nombres de la página actual
            const nombresPagina = grupos.map((g) => g.Nombre);

            const detalleDias = await this.prisma.catHorarios.findMany({
                where: {
                    idTenant,
                    Activo: true,
                    Nombre: { in: nombresPagina },
                },
                select: {
                    idHorario: true,
                    Nombre: true,
                    DiaSemana: true,
                    HoraEntrada: true,
                    HoraSalida: true,
                    FechaRegistro: true,
                },
                orderBy: { idHorario: 'asc' },
            });

            // Orden estándar de la semana para presentar al frontend
            const ordenDias: Record<string, number> = {
                Lunes: 1,
                Martes: 2,
                Miércoles: 3,
                Jueves: 4,
                Viernes: 5,
                Sábado: 6,
                Domingo: 7,
            };

            // 3. Armar la respuesta estructurada agrupando por horario
            const schedulesMap = new Map<string, any>();

            for (const reg of detalleDias) {
                if (!schedulesMap.has(reg.Nombre)) {
                    schedulesMap.set(reg.Nombre, {
                        nombre: reg.Nombre,
                        fechaRegistro: reg.FechaRegistro,
                        dias: [],
                    });
                }

                schedulesMap.get(reg.Nombre).dias.push({
                    idHorario: reg.idHorario,
                    diaSemana: reg.DiaSemana,
                    horaEntrada: this.formatTimeToHHmmss(reg.HoraEntrada),
                    horaSalida: this.formatTimeToHHmmss(reg.HoraSalida),
                });
            }

            // Ordenar los días internamente de Lunes a Domingo
            const data = Array.from(schedulesMap.values()).map((horario) => {
                horario.dias.sort(
                    (a: any, b: any) =>
                        (ordenDias[a.diaSemana] || 99) - (ordenDias[b.diaSemana] || 99),
                );
                return horario;
            });

            return {
                data,
                meta: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit) || 1,
                },
            };
        } catch (error: any) {
            this.logger.error(`Error al listar horarios: ${error.message}`);
            throw new InternalServerErrorException(
                `Error al obtener los horarios: ${error.message}`,
            );
        }
    }

    // Actualizar un catálogo de horario
    async updateSchedule(
        activeUser: ActiveUserDto,
        currentScheduleName: string,
        dto: CreateScheduleCatalogDto,
    ) {
        const user = await this.prisma.auth_user.findUnique({
            where: { id: activeUser.id },
            select: { idTenant: true, uuid: true },
        });

        if (!user) throw new NotFoundException('No se encontró el usuario');
        if (!user.idTenant) throw new BadRequestException('El usuario no tiene un tenant asignado');

        const idTenant = user.idTenant;
        const oldName = currentScheduleName.trim();
        const newName = dto.nombre.trim();

        // 1. Validar que el horario a actualizar exista actualmente
        const registrosActuales = await this.prisma.catHorarios.findMany({
            where: {
                idTenant,
                Nombre: oldName,
                Activo: true,
            },
            select: { idHorario: true },
        });

        if (registrosActuales.length === 0) {
            throw new NotFoundException(`No se encontró el horario "${oldName}" para actualizar.`);
        }

        // 2. Si se cambió el nombre, validar que el nuevo nombre no esté en uso por otro horario
        if (oldName.toLowerCase() !== newName.toLowerCase()) {
            const existeConNuevoNombre = await this.prisma.catHorarios.findFirst({
                where: {
                    idTenant,
                    Nombre: newName,
                    Activo: true,
                },
                select: { idHorario: true },
            });

            if (existeConNuevoNombre) {
                throw new BadRequestException(
                    `Ya existe otro horario registrado con el nombre "${newName}".`,
                );
            }
        }

        // 3. Validar que no se envíen días duplicados en el payload
        const diasSet = new Set<string>();
        for (const d of dto.dias) {
            if (diasSet.has(d.diaSemana)) {
                throw new BadRequestException(
                    `El día "${d.diaSemana}" está duplicado en la configuración del horario.`,
                );
            }
            diasSet.add(d.diaSemana);
        }

        try {
            // 4. Transacción: eliminar días anteriores e insertar la nueva configuración
            await this.prisma.$transaction(async (tx) => {
                // Eliminar los registros anteriores del horario
                await tx.catHorarios.deleteMany({
                    where: {
                        idTenant,
                        Nombre: oldName,
                    },
                });

                // Crear los nuevos registros actualizados
                const nuevosRegistros = dto.dias.map((d) => ({
                    idTenant,
                    Nombre: newName,
                    DiaSemana: d.diaSemana,
                    HoraEntrada: this.parseTimeStringToDate(d.horaEntrada),
                    HoraSalida: this.parseTimeStringToDate(d.horaSalida),
                    Activo: true,
                    UsuarioRegistro: user.uuid,
                }));

                await tx.catHorarios.createMany({
                    data: nuevosRegistros,
                });
            });

            this.logger.log(`Horario "${oldName}" actualizado a "${newName}" exitosamente.`);

            return {
                success: true,
                message: 'Catálogo de horario actualizado exitosamente.',
                nombre: newName,
                totalDiasConfigurados: dto.dias.length,
            };
        } catch (error: any) {
            this.logger.error(`Error al actualizar horario: ${error.message}`);
            throw new InternalServerErrorException(
                `Error al actualizar el horario en base de datos: ${error.message}`,
            );
        }
    }
}