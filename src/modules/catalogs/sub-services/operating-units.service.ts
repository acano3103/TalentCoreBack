import {
    Injectable,
    Logger,
    NotFoundException,
    InternalServerErrorException,
} from "@nestjs/common";
import { Prisma } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateOperatingUnitDto } from "../dto/create-operating-unit.dto";
import { UpdateOperatingUnitDto } from "../dto/update-operating-unit.dto";
import { ActiveUserDto } from "src/modules/auth/dto/active-user.dto";
import { ExcelColumn, ExcelExportService } from "src/common/services/excel-export.service";

@Injectable()
export class OperatingUnitsService {
    constructor(private readonly prisma: PrismaService,
    private readonly excelExportService: ExcelExportService,
    ) { }

    private readonly logger = new Logger(OperatingUnitsService.name);

        /**
     * Where común de unidades operativas (empresa, tenant y búsqueda).
     * Lo usan la tabla paginada y la exportación, para que ambas filtren igual.
     */
    private buildOperatingUnitsWhere(
        idEmpresa: number,
        user: ActiveUserDto,
        query: string = "",
    ): Prisma.CatUnidadesOperativasWhereInput {
        const search = query.trim();
        return {
            idEmpresa: Number(idEmpresa),
            idTenant: user.idTenant as number,
            ...(search
                ? {
                    OR: [
                        { Nombre: { contains: search } },
                        { Codigo: { contains: search } },
                        { ResponsableContacto: { contains: search } },
                    ],
                }
                : {}),
        };
    }

    async findAll(idEmpresa: number, page: number, limit: number, query: string = "", user: ActiveUserDto) {   
    if (!user.idTenant) {
        throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }

        const pageNumber = Math.max(1, Number(page) || 1);
        const limitNumber = Math.max(1, Number(limit) || 10);
        const skip = (pageNumber - 1) * limitNumber;

        const whereCondition = this.buildOperatingUnitsWhere(idEmpresa, user, query);

        try {
            const [records, total] = await this.prisma.$transaction([
                this.prisma.catUnidadesOperativas.findMany({
                    where: whereCondition,
                    skip,
                    take: limitNumber,
                    orderBy: {
                        idUnidadOperativa: "desc",
                    },
                    include: {
                        _count: {
                            select: {
                                CatSites: {
                                    where: { Activo: true },
                                },
                            },
                        },
                    },
                }),
                this.prisma.catUnidadesOperativas.count({
                    where: whereCondition,
                }),
            ]);

            const operatingUnits = records.map((record: any) => {
                const { _count, ...rest } = record;
                return {
                    ...rest,
                    idUnidadOperativa: Number(record.idUnidadOperativa),
                    idEmpresa: Number(record.idEmpresa),
                    EsExterna: Boolean(record.EsExterna),
                    Activo: Boolean(record.Activo),
                    totalSites: _count?.CatSites ?? 0,
                };
            });

            return {
                operatingUnits,
                total,
                currentPage: pageNumber,
                totalPages: Math.ceil(total / limitNumber) || 1,
            };
        } catch (error:any) {
            this.logger.error(
                `Error al consultar unidades operativas de la empresa ${idEmpresa}: ${error.message}`,
                error.stack
            );
            throw error;
        }
    }

        // Exporta a Excel TODAS las unidades operativas que cumplan los filtros (sin paginar)
    async exportOperatingUnits(
        idEmpresa: number,
        user: ActiveUserDto,
        filters: { search?: string; activo?: string; fechaDesde?: string; fechaHasta?: string },
    ): Promise<Buffer> {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const where = this.buildOperatingUnitsWhere(idEmpresa, user, filters.search ?? "");

        // Estatus: 'true' = activas, 'false' = inactivas, vacío = todas
        if (filters.activo === "true") where.Activo = true;
        if (filters.activo === "false") where.Activo = false;

        // Rango de fechas de registro (días completos)
        const esFecha = (f?: string) => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);
        if (esFecha(filters.fechaDesde) || esFecha(filters.fechaHasta)) {
            where.FechaRegistro = {
                ...(esFecha(filters.fechaDesde) && { gte: new Date(`${filters.fechaDesde}T00:00:00.000Z`) }),
                ...(esFecha(filters.fechaHasta) && { lte: new Date(`${filters.fechaHasta}T23:59:59.999Z`) }),
            };
        }

        const records = await this.prisma.catUnidadesOperativas.findMany({
            where,
            orderBy: { idUnidadOperativa: "desc" }, // Mismo orden que la tabla
            include: {
                _count: {
                    select: {
                        CatSites: { where: { Activo: true } }, // Mismo conteo que la tabla
                    },
                },
            },
        });

        type UnidadExport = (typeof records)[number];

        const formatFecha = (fecha: Date | null) => {
            if (!fecha) return "";
            const [anio, mes, dia] = fecha.toISOString().split("T")[0].split("-");
            return `${dia}/${mes}/${anio}`;
        };

        const columns: ExcelColumn<UnidadExport>[] = [
            { header: "Código", key: "codigo", width: 18, value: (u) => u.Codigo },
            { header: "Nombre", key: "nombre", width: 40, value: (u) => u.Nombre },
            { header: "Descripción", key: "descripcion", width: 45, value: (u) => u.Descripcion },
            { header: "Tipo", key: "tipo", width: 12, value: (u) => (u.EsExterna ? "Externa" : "Interna") },
            { header: "Responsable", key: "responsable", width: 28, value: (u) => u.ResponsableContacto },
            { header: "Teléfono", key: "telefono", width: 16, value: (u) => u.TelefonoContacto },
            { header: "Correo", key: "correo", width: 30, value: (u) => u.CorreoContacto },
            { header: "Ubicaciones Activas", key: "totalSites", width: 18, value: (u) => u._count?.CatSites ?? 0 },
            { header: "Estatus", key: "estatus", width: 12, value: (u) => (u.Activo ? "Activa" : "Inactiva") },
            { header: "Fecha de Registro", key: "fechaRegistro", width: 18, value: (u) => formatFecha(u.FechaRegistro) },
        ];

        return this.excelExportService.generate({
            sheetName: "Unidades Operativas",
            columns,
            rows: records,
        });
    }


    async findById(idEmpresa: number, idUnidadOperativa: number, user: ActiveUserDto) {   
    if (!user.idTenant) {
        throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }

        try {
            const record = await this.prisma.catUnidadesOperativas.findFirst({
                where: {
                    idUnidadOperativa: Number(idUnidadOperativa),
                    idEmpresa: Number(idEmpresa),
                     idTenant: user.idTenant,
                },
                include: {
                    _count: {
                        select: {
                            CatSites: {
                                where: { Activo: true },
                            },
                        },
                    },
                },
            });

            if (!record) {
                throw new NotFoundException(
                    `Unidad operativa con ID ${idUnidadOperativa} no encontrada para esta empresa`
                );
            }

            const { _count, ...rest } = record as any;
            return {
                ...rest,
                idUnidadOperativa: Number(record.idUnidadOperativa),
                idEmpresa: Number(record.idEmpresa),
                EsExterna: Boolean(record.EsExterna),
                Activo: Boolean(record.Activo),
                totalSites: _count?.CatSites ?? 0,
            };
        } catch (error:any) {
            if (error instanceof NotFoundException) throw error;
            this.logger.error(
                `Error al obtener la unidad operativa ${idUnidadOperativa}: ${error.message}`,
                error.stack
            );
            throw new InternalServerErrorException("Error al consultar la unidad operativa");
        }
    }

    async create(idEmpresa: number, dto: CreateOperatingUnitDto, user: ActiveUserDto) {
        if (!user.idTenant) {
        throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }

     const idTenant = user.idTenant;

        try {
            const result = await this.prisma.$transaction(async (tx: any) => {
                const newRecord = await tx.catUnidadesOperativas.create({
                    data: {
                        idEmpresa: Number(idEmpresa),
                         idTenant,
                        Codigo: dto.codigo ? dto.codigo.trim().toUpperCase() : null,
                        Nombre: dto.nombre.trim(),
                        Descripcion: dto.descripcion?.trim() || null,
                        EsExterna: dto.esExterna === 1,
                        ResponsableContacto: dto.responsableContacto?.trim() || null,
                        TelefonoContacto: dto.telefonoContacto?.trim() || null,
                        CorreoContacto: dto.correoContacto?.trim() || null,
                        Activo: dto.activo !== undefined ? dto.activo === 1 : true,
                    },
                });

                const userFullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || `Usuario #${user.id}`;
                const historyModel = tx.historicoMovimientos || tx.HistoricoMovimientos;

                if (historyModel) {
                    await historyModel.create({
                        data: {
                            idUsuario: user.id,
                            idEmpresa: Number(idEmpresa),
                            accion: "CREAR",
                            tablaOrigen: "CatUnidadesOperativas",
                            idRegistro: String(newRecord.idUnidadOperativa),
                            descripcion: `Unidad Operativa "${newRecord.Nombre}" creada por ${userFullName}`,
                            fechaCreacion: new Date(),
                        },
                    });
                }

                return newRecord;
            });

            return {
                success: true,
                message: "Unidad operativa creada exitosamente",
                data: {
                    ...result,
                    idUnidadOperativa: Number(result.idUnidadOperativa),
                    idEmpresa: Number(result.idEmpresa),
                    EsExterna: Boolean(result.EsExterna),
                    Activo: Boolean(result.Activo),
                },
            };
        } catch (error:any) {
            this.logger.error(
                `Error al crear unidad operativa para la empresa ${idEmpresa}: ${error.message}`,
                error.stack
            );
            throw new InternalServerErrorException("Error al crear la unidad operativa");
        }
    }

    async update(idEmpresa: number, idUnidadOperativa: number, dto: UpdateOperatingUnitDto, user: ActiveUserDto) {
        const existingRecord = await this.findById(idEmpresa, idUnidadOperativa,user);

        try {
            const dataToUpdate: Prisma.CatUnidadesOperativasUpdateInput = {};

            if (dto.codigo !== undefined) { dataToUpdate.Codigo = dto.codigo ? dto.codigo.trim().toUpperCase() : null; }
            if (dto.nombre !== undefined) { dataToUpdate.Nombre = dto.nombre.trim(); }
            if (dto.descripcion !== undefined) { dataToUpdate.Descripcion = dto.descripcion ? dto.descripcion.trim() : null; }
            if (dto.esExterna !== undefined) { dataToUpdate.EsExterna = dto.esExterna === 1; }
            if (dto.responsableContacto !== undefined) { dataToUpdate.ResponsableContacto = dto.responsableContacto ? dto.responsableContacto.trim() : null; }
            if (dto.telefonoContacto !== undefined) { dataToUpdate.TelefonoContacto = dto.telefonoContacto ? dto.telefonoContacto.trim() : null; }
            if (dto.correoContacto !== undefined) { dataToUpdate.CorreoContacto = dto.correoContacto ? dto.correoContacto.trim() : null; }
            if (dto.activo !== undefined) { dataToUpdate.Activo = dto.activo === 1; }

            const result = await this.prisma.$transaction(async (tx: any) => {
                const updatedRecord = await tx.catUnidadesOperativas.update({
                    where: { idUnidadOperativa: Number(idUnidadOperativa) },
                    data: dataToUpdate,
                });

                const userFullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || `Usuario #${user.id}`;
                const historyModel = tx.historicoMovimientos || tx.HistoricoMovimientos;

                if (historyModel) {
                    await historyModel.create({
                        data: {
                            idUsuario: user.id,
                            idEmpresa: Number(idEmpresa),
                            accion: "EDITAR",
                            tablaOrigen: "CatUnidadesOperativas",
                            idRegistro: String(idUnidadOperativa),
                            descripcion: `Unidad Operativa "${updatedRecord.Nombre}" actualizada por ${userFullName}`,
                            fechaCreacion: new Date(),
                        },
                    });
                }

                return updatedRecord;
            });

            return {
                success: true,
                message: "Unidad operativa actualizada exitosamente",
                data: {
                    ...result,
                    idUnidadOperativa: Number(result.idUnidadOperativa),
                    idEmpresa: Number(result.idEmpresa),
                    EsExterna: Boolean(result.EsExterna),
                    Activo: Boolean(result.Activo),
                },
            };
        } catch (error:any) {
            this.logger.error(
                `Error al actualizar la unidad operativa ${idUnidadOperativa}: ${error.message}`,
                error.stack
            );
            throw new InternalServerErrorException("Error al actualizar la unidad operativa");
        }
    }

    async changeStatus(companyId: number, idUnidadOperativa: number, active: boolean, user: ActiveUserDto) {
        const existingRecord = await this.findById(companyId, idUnidadOperativa, user);

        try {
            await this.prisma.$transaction(async (tx: any) => {
                await tx.catUnidadesOperativas.update({
                    where: {
                        idUnidadOperativa: Number(idUnidadOperativa),
                    },
                    data: {
                        Activo: active,
                    },
                });

                const userFullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || `Usuario #${user.id}`;
                const historyModel = tx.historicoMovimientos || tx.HistoricoMovimientos;

                if (historyModel) {
                    await historyModel.create({
                        data: {
                            idUsuario: user.id,
                            idEmpresa: Number(companyId),
                            accion: active ? "REACTIVAR" : "DESACTIVAR",
                            tablaOrigen: "CatUnidadesOperativas",
                            idRegistro: String(idUnidadOperativa),
                            descripcion: `Unidad Operativa "${existingRecord.Nombre}" ${active ? "reactivada" : "desactivada"} por ${userFullName}`,
                            fechaCreacion: new Date(),
                        },
                    });
                }
            });

            return {
                success: true,
                message: active
                    ? "Unidad operativa reactivada correctamente"
                    : "Unidad operativa desactivada correctamente",
            };
        } catch (error:any) {
            this.logger.error(
                `Error al cambiar el estatus de la unidad operativa ${idUnidadOperativa}: ${error.message}`,
                error.stack
            );
            throw new InternalServerErrorException("Error al actualizar el estatus de la unidad operativa");
        }
    }
}