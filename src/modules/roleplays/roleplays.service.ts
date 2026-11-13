import {
    BadRequestException,
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
                        CalificacionMinima: dto.CalificacionMinima ?? null,
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

        const { Criterios, ...rolePlayData } = dto;
        const planCriterios = Criterios !== undefined ? await this.planCriterios(roleplayId, Criterios) : null;

        try {
            await this.prisma.$transaction(async (tx) => {
                if (planCriterios && Criterios) {
                    if (planCriterios.eliminar.length) {
                        await tx.evaluationCriteria.deleteMany({ where: { idCriterio: { in: planCriterios.eliminar } } });
                    }
                    for (const [i, c] of Criterios.entries()) {
                        if (!c.idCriterio) continue;
                        await tx.evaluationCriteria.update({
                            where: { idCriterio: c.idCriterio },
                            data: { Nombre: c.Nombre, Descripcion: c.Descripcion, PuntosMaximos: c.PuntosMaximos, Orden: i, Tipo: c.Tipo },
                        });
                    }
                    const nuevos = Criterios.map((c, i) => ({ ...c, Orden: i })).filter((c) => !c.idCriterio);
                    if (nuevos.length) {
                        await tx.evaluationCriteria.createMany({ data: this.mapCriterios(nuevos, roleplayId, idTenant) });
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

    // Los criterios ya evaluados se editan, pero no se pueden borrar
    private async planCriterios(roleplayId: number, criterios: CreateCriterionDto[]) {
        const actuales = await this.prisma.evaluationCriteria.findMany({
            where: { idRolePlay: roleplayId },
            select: { idCriterio: true, Nombre: true },
        });
        const idsActuales = new Set(actuales.map((c) => c.idCriterio));
        const idsRecibidos = criterios.map((c) => c.idCriterio).filter((id): id is number => !!id);

        if (idsRecibidos.some((id) => !idsActuales.has(id))) {
            throw new BadRequestException('Uno de los criterios no pertenece a este role play.');
        }

        const eliminar = actuales.filter((c) => !idsRecibidos.includes(c.idCriterio));
        if (eliminar.length) {
            const evaluados = await this.prisma.rolePlayEvaluacionCriterios.findMany({
                where: { idCriterio: { in: eliminar.map((c) => c.idCriterio) } },
                select: { idCriterio: true },
                distinct: ['idCriterio'],
            });
            if (evaluados.length) {
                const nombres = eliminar.filter((c) => evaluados.some((e) => e.idCriterio === c.idCriterio)).map((c) => `"${c.Nombre}"`);
                throw new BadRequestException(`No se puede eliminar ${nombres.join(', ')} porque ya tiene evaluaciones registradas.`);
            }
        }

        return { eliminar: eliminar.map((c) => c.idCriterio) };
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
