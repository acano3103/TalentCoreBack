import {
    Injectable,
    Logger,
    NotFoundException,
    InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateRoleplayDto } from './dto/create-roleplay.dto';
import { UpdateRoleplayDto } from './dto/update-roleplay.dto';
import { CreateCriterionDto } from './dto/create-criterion.dto';

@Injectable()
export class RoleplaysService {
    private readonly logger = new Logger(RoleplaysService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAll(companyId: number, user: ActiveUserDto, isActive?: boolean) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const whereCondition: any = {
            idEmpresa: companyId,
            idTenant: user.idTenant,
            ...(isActive !== undefined ? { Activo: isActive } : {}),
        };

        const rolePlays = await this.prisma.rolePlays.findMany({
            where: whereCondition,
            include: {
                EvaluationCriteria: { orderBy: { Orden: 'asc' } },
            },
            orderBy: { FechaRegistro: 'desc' },
        });

        return rolePlays;
    }

    async findOne(companyId: number, roleplayId: number, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const rolePlay = await this.prisma.rolePlays.findFirst({
            where: {
                idRolePlay: roleplayId,
                idEmpresa: companyId,
                idTenant: user.idTenant,
            },
            include: {
                EvaluationCriteria: { orderBy: { Orden: 'asc' } },
            },
        });

        if (!rolePlay) {
            throw new NotFoundException(`Role play con id ${roleplayId} no encontrado.`);
        }

        return rolePlay;
    }

    async create(companyId: number, dto: CreateRoleplayDto, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant;

        try {
            const nuevoRolePlay = await this.prisma.$transaction(async (tx) => {
                const rolePlay = await tx.rolePlays.create({
                    data: {
                        idTenant,
                        idEmpresa: companyId,
                        Titulo: dto.Titulo.trim(),
                        Descripcion: dto.Descripcion?.trim() || null,
                        Contexto: dto.Contexto,
                        Objetivo: dto.Objetivo,
                        AiScript: dto.AiScript,
                        ObjetivosAprendizaje: dto.ObjetivosAprendizaje || null,
                        DuracionMinutos: dto.DuracionMinutos ?? 15,
                        idUsuarioCreador: user.id,
                        FechaRegistro: new Date(),
                        Activo: true,
                    },
                });

                if (dto.Criterios.length > 0) {
                    await tx.evaluationCriteria.createMany({
                        data: this.mapCriterios(dto.Criterios, rolePlay.idRolePlay, idTenant),
                    });
                }

                const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `Usuario #${user.id}`;
                const historyModel = tx.historicoMovimientos;
                if (historyModel) {
                    await historyModel.create({
                        data: {
                            idUsuario: user.id,
                            idEmpresa: companyId,
                            accion: 'CREAR',
                            tablaOrigen: 'RolePlays',
                            idRegistro: String(rolePlay.idRolePlay),
                            descripcion: `Role play "${rolePlay.Titulo}" creado por ${userFullName}`,
                            fechaCreacion: new Date(),
                        },
                    });
                }

                return rolePlay.idRolePlay;
            });

            return this.findOne(companyId, nuevoRolePlay, user);
        } catch (error: any) {
            this.logger.error(`Error al crear el role play: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error interno al crear el role play.');
        }
    }

    async update(companyId: number, roleplayId: number, dto: UpdateRoleplayDto, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant;

        const existente = await this.prisma.rolePlays.findFirst({
            where: { idRolePlay: roleplayId, idEmpresa: companyId, idTenant },
        });

        if (!existente) {
            throw new NotFoundException(`Role play con id ${roleplayId} no encontrado.`);
        }

        try {
            await this.prisma.$transaction(async (tx) => {
                const { Criterios, ...rolePlayData } = dto;

                if (Criterios !== undefined) {
                    await tx.evaluationCriteria.deleteMany({ where: { idRolePlay: roleplayId } });
                    if (Criterios.length > 0) {
                        await tx.evaluationCriteria.createMany({
                            data: this.mapCriterios(Criterios, roleplayId, idTenant),
                        });
                    }
                }

                if (Object.keys(rolePlayData).length > 0) {
                    await tx.rolePlays.update({
                        where: { idRolePlay: roleplayId },
                        data: {
                            ...rolePlayData,
                            FechaActualizacion: new Date(),
                        },
                    });
                }

                const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `Usuario #${user.id}`;
                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario: user.id,
                        idEmpresa: companyId,
                        accion: 'EDITAR',
                        tablaOrigen: 'RolePlays',
                        idRegistro: String(roleplayId),
                        descripcion: `Role play "${existente.Titulo}" actualizado por ${userFullName}`,
                        fechaCreacion: new Date(),
                    },
                });
            });

            return this.findOne(companyId, roleplayId, user);
        } catch (error: any) {
            this.logger.error(`Error al actualizar el role play ${roleplayId}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error interno al actualizar el role play.');
        }
    }

    async changeStatus(companyId: number, roleplayId: number, active: boolean, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const existente = await this.prisma.rolePlays.findFirst({
            where: { idRolePlay: roleplayId, idEmpresa: companyId, idTenant: user.idTenant },
        });

        if (!existente) {
            throw new NotFoundException(`Role play con id ${roleplayId} no encontrado.`);
        }

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.rolePlays.update({
                    where: { idRolePlay: roleplayId },
                    data: { Activo: active, FechaActualizacion: new Date() },
                });

                const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `Usuario #${user.id}`;
                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario: user.id,
                        idEmpresa: companyId,
                        accion: active ? 'REACTIVAR' : 'DESACTIVAR',
                        tablaOrigen: 'RolePlays',
                        idRegistro: String(roleplayId),
                        descripcion: `Role play "${existente.Titulo}" ${active ? 'reactivado' : 'desactivado'} por ${userFullName}`,
                        fechaCreacion: new Date(),
                    },
                });
            });

            return {
                success: true,
                message: active ? 'Role play activado correctamente' : 'Role play desactivado correctamente',
            };
        } catch (error: any) {
            this.logger.error(`Error al cambiar el estatus del role play ${roleplayId}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error al actualizar el estatus del role play.');
        }
    }

    private mapCriterios(criterios: CreateCriterionDto[], idRolePlay: number, idTenant: number) {
        return criterios.map((criterio) => ({
            idRolePlay,
            idTenant,
            Nombre: criterio.Nombre,
            Descripcion: criterio.Descripcion,
            PuntosMaximos: criterio.PuntosMaximos,
            Orden: criterio.Orden,
            Tipo: criterio.Tipo,
        }));
    }
}