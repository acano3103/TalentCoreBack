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
import { ORDENDIAS } from './constants/constants';
import * as ExcelJS from 'exceljs';

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

    // Obtener horarios paginados agrupados por Nombre
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
                        (ORDENDIAS[a.diaSemana] || 99) - (ORDENDIAS[b.diaSemana] || 99),
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

    // Obtiene todos los horarios activos del tenant agrupados con su detalle de días (sin paginación)
    async findAllSchedulesUnpaginated(activeUser: ActiveUserDto) {
        const user = await this.prisma.auth_user.findUnique({
            where: { id: activeUser.id },
            select: { idTenant: true },
        });

        if (!user) throw new NotFoundException('No se encontró el usuario');
        if (!user.idTenant) throw new BadRequestException('El usuario no tiene un tenant asignado');

        const idTenant = user.idTenant;

        try {
            // 1. Obtenemos todos los registros activos ordenados alfabéticamente por Nombre
            const registros = await this.prisma.catHorarios.findMany({
                where: {
                    idTenant,
                    Activo: true,
                },
                select: {
                    idHorario: true,
                    Nombre: true,
                    DiaSemana: true,
                    HoraEntrada: true,
                    HoraSalida: true,
                    FechaRegistro: true,
                },
                orderBy: [
                    { Nombre: 'asc' },
                    { idHorario: 'asc' },
                ],
            });

            if (registros.length === 0) {
                return {
                    data: [],
                    total: 0,
                };
            }

            // 2. Agrupación por Nombre en un solo recorrido
            const schedulesMap = new Map<string, any>();

            for (const reg of registros) {
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

            // 3. Ordenar los días internos de cada grupo (Lunes -> Domingo)
            const data = Array.from(schedulesMap.values()).map((horario) => {
                horario.dias.sort(
                    (a: any, b: any) =>
                        (ORDENDIAS[a.diaSemana] || 99) - (ORDENDIAS[b.diaSemana] || 99),
                );
                return horario;
            });

            return {
                data,
                total: data.length,
            };
        } catch (error: any) {
            this.logger.error(`Error al listar todos los horarios: ${error.message}`, error.stack);
            throw new InternalServerErrorException(
                `Error al obtener el catálogo completo de horarios: ${error.message}`,
            );
        }
    }

    // Genera y retorna un Buffer con la plantilla Excel para carga masiva de horarios
    async generateBulkTemplate(activeUser: ActiveUserDto): Promise<Buffer> {
        const user = await this.prisma.auth_user.findUnique({
            where: { id: activeUser.id },
            select: { idTenant: true },
        });
        if (!user) throw new NotFoundException('No se encontró el usuario');
        if (!user.idTenant) throw new BadRequestException('El usuario no tiene un tenant asignado');

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Talent Core';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Horarios');

        // Columnas requeridas
        sheet.columns = [
            { header: 'Nombre del Horario *', key: 'nombre', width: 35 },
            { header: 'Día de la Semana *', key: 'dia', width: 22 },
            { header: 'Hora Entrada (HH:mm) *', key: 'hora_entrada', width: 25 },
            { header: 'Hora Salida (HH:mm) *', key: 'hora_salida', width: 25 },
        ];

        // Estilo encabezado Slate 800
        const headerRow = sheet.getRow(1);
        headerRow.height = 28;
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1E293B' },
            };
            cell.font = {
                name: 'Calibri',
                size: 11,
                bold: true,
                color: { argb: 'FFFFFFFF' },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Filas de ejemplo guiando al usuario
        const samples = [
            {
                nombre: 'TURNO MATUTINO 9 A 6',
                dia: 'Lunes',
                hora_entrada: '09:00',
                hora_salida: '18:00',
            },
            {
                nombre: 'TURNO MATUTINO 9 A 6',
                dia: 'Martes',
                hora_entrada: '09:00',
                hora_salida: '18:00',
            },
            {
                nombre: 'TURNO MATUTINO 9 A 6',
                dia: 'Miércoles',
                hora_entrada: '09:00',
                hora_salida: '18:00',
            },
            {
                nombre: 'TURNO MATUTINO 9 A 6',
                dia: 'Jueves',
                hora_entrada: '09:00',
                hora_salida: '18:00',
            },
            {
                nombre: 'TURNO MATUTINO 9 A 6',
                dia: 'Viernes',
                hora_entrada: '09:00',
                hora_salida: '18:00',
            },
            {
                nombre: 'TURNO FIN DE SEMANA',
                dia: 'Sábado',
                hora_entrada: '08:00',
                hora_salida: '14:00',
            },
            {
                nombre: 'TURNO FIN DE SEMANA',
                dia: 'Domingo',
                hora_entrada: '08:00',
                hora_salida: '14:00',
            },
        ];

        for (const sample of samples) {
            const row = sheet.addRow(sample);
            row.font = { italic: true, color: { argb: 'FF64748B' } };
            row.alignment = { vertical: 'middle', horizontal: 'left' };
        }

        const uint8Array = await workbook.xlsx.writeBuffer();
        return Buffer.from(uint8Array);
    }

    // Procesa el archivo Excel de horarios cargado
    async processBulkSchedules(file: Express.Multer.File, activeUser: ActiveUserDto) {
        if (!file) throw new BadRequestException('El archivo de Excel no fue cargado');

        const user = await this.prisma.auth_user.findUnique({
            where: { id: activeUser.id },
            select: { idTenant: true, uuid: true },
        });
        if (!user) throw new NotFoundException('No se encontró el usuario');
        if (!user.idTenant) throw new BadRequestException('El usuario no tiene un tenant asignado');

        const idTenant = user.idTenant;

        const workbook = new ExcelJS.Workbook();
        try {
            await workbook.xlsx.load(file.buffer as any);
        } catch {
            throw new BadRequestException('El archivo subido no es un archivo Excel válido o está dañado.');
        }

        const sheet = workbook.getWorksheet('Horarios') || workbook.worksheets[0];
        if (!sheet) {
            throw new BadRequestException('El archivo Excel no contiene hojas de trabajo.');
        }

        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
        const diasValidos = [
            'lunes',
            'martes',
            'miercoles',
            'miércoles',
            'jueves',
            'viernes',
            'sabado',
            'sábado',
            'domingo',
        ];

        // Helper para formatear string a HH:mm
        const normalizarHora = (raw: any): string => {
            if (!raw) return '';
            if (raw instanceof Date) {
                const h = String(raw.getUTCHours()).padStart(2, '0');
                const m = String(raw.getUTCMinutes()).padStart(2, '0');
                return `${h}:${m}`;
            }
            const str = String(raw).trim();
            if (timeRegex.test(str)) return str;
            if (str.length >= 5 && timeRegex.test(str.substring(0, 5))) {
                return str.substring(0, 5);
            }
            return str;
        };

        // Helper para normalizar el nombre del día a capitalizado estándar
        const normalizarDia = (dia: string): string => {
            const d = dia.trim().toLowerCase();
            if (d === 'miercoles' || d === 'miércoles') return 'Miércoles';
            if (d === 'sabado' || d === 'sábado') return 'Sábado';
            return d.charAt(0).toUpperCase() + d.slice(1);
        };

        const errors: { row: number; error: string }[] = [];
        const groupedSchedules = new Map<
            string,
            {
                rows: number[];
                dias: Array<{ diaSemana: string; horaEntrada: string; horaSalida: string; row: number }>;
            }
        >();

        const rowCount = sheet.rowCount;

        // 1. Lectura y validaciones de formato fila por fila
        for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
            const row = sheet.getRow(rowNumber);

            const rawNombre = row.getCell(1).text?.trim();
            const rawDia = row.getCell(2).text?.trim();
            const rawHoraEntrada = normalizarHora(row.getCell(3).value ?? row.getCell(3).text);
            const rawHoraSalida = normalizarHora(row.getCell(4).value ?? row.getCell(4).text);

            // Fila vacía se omite
            if (!rawNombre && !rawDia && !rawHoraEntrada && !rawHoraSalida) {
                continue;
            }

            if (!rawNombre) {
                errors.push({ row: rowNumber, error: 'El Nombre del Horario es obligatorio.' });
                continue;
            }

            if (!rawDia) {
                errors.push({ row: rowNumber, error: 'El Día de la Semana es obligatorio.' });
                continue;
            }

            const diaLower = rawDia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (!['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].includes(diaLower)) {
                errors.push({
                    row: rowNumber,
                    error: `El día "${rawDia}" no es válido. Usa: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado o Domingo.`,
                });
                continue;
            }

            if (!rawHoraEntrada || !timeRegex.test(rawHoraEntrada)) {
                errors.push({
                    row: rowNumber,
                    error: `La Hora de Entrada "${rawHoraEntrada}" no tiene formato válido (HH:mm, ej. 09:00).`,
                });
                continue;
            }

            if (!rawHoraSalida || !timeRegex.test(rawHoraSalida)) {
                errors.push({
                    row: rowNumber,
                    error: `La Hora de Salida "${rawHoraSalida}" no tiene formato válido (HH:mm, ej. 18:00).`,
                });
                continue;
            }

            const nombreKey = rawNombre.toUpperCase();
            if (!groupedSchedules.has(nombreKey)) {
                groupedSchedules.set(nombreKey, { rows: [], dias: [] });
            }

            const group = groupedSchedules.get(nombreKey)!;
            group.rows.push(rowNumber);
            group.dias.push({
                diaSemana: normalizarDia(rawDia),
                horaEntrada: rawHoraEntrada,
                horaSalida: rawHoraSalida,
                row: rowNumber,
            });
        }

        let successCount = 0;
        const totalProcessed = groupedSchedules.size;

        // 2. Procesamiento y guardado de cada plantilla de horario
        for (const [nombre, group] of groupedSchedules.entries()) {
            // Validar si el horario ya existe en base de datos
            const existe = await this.prisma.catHorarios.findFirst({
                where: {
                    idTenant,
                    Nombre: nombre,
                    Activo: true,
                },
                select: { idHorario: true },
            });

            if (existe) {
                for (const r of group.rows) {
                    errors.push({
                        row: r,
                        error: `Ya existe un horario activo registrado con el nombre "${nombre}".`,
                    });
                }
                continue;
            }

            // Validar que no se dupliquen días para la misma plantilla
            const diasSet = new Set<string>();
            let hasDuplicateDay = false;

            for (const d of group.dias) {
                if (diasSet.has(d.diaSemana)) {
                    errors.push({
                        row: d.row,
                        error: `El día "${d.diaSemana}" está duplicado para el horario "${nombre}".`,
                    });
                    hasDuplicateDay = true;
                }
                diasSet.add(d.diaSemana);
            }

            if (hasDuplicateDay) {
                continue;
            }

            // Inserción masiva en BD dentro de una transacción
            try {
                await this.prisma.$transaction(async (tx) => {
                    const registros = group.dias.map((d) => ({
                        idTenant,
                        Nombre: nombre,
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

                successCount++;
            } catch (err: any) {
                for (const r of group.rows) {
                    errors.push({
                        row: r,
                        error: err?.message || `Error al guardar el horario "${nombre}" en base de datos.`,
                    });
                }
            }
        }

        return {
            message: `Carga masiva completada: ${successCount} horarios creados exitosamente.`,
            successCount,
            totalProcessed,
            errors,
        };
    }
}