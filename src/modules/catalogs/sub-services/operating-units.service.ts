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

@Injectable()
export class OperatingUnitsService {
    constructor(private readonly prisma: PrismaService) { }

    private readonly logger = new Logger(OperatingUnitsService.name);

    async findAll(idEmpresa: number, page: number, limit: number, query: string = "", user: ActiveUserDto) {   
    if (!user.idTenant) {
        throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }

        const pageNumber = Math.max(1, Number(page) || 1);
        const limitNumber = Math.max(1, Number(limit) || 10);
        const skip = (pageNumber - 1) * limitNumber;
        const search = query.trim();

        const whereCondition: Prisma.CatUnidadesOperativasWhereInput = {
            idEmpresa: Number(idEmpresa),
            idTenant: user.idTenant,
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