import { ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePatronalRecordDto } from '../dto/create-patronal-record.dto';
import { UpdatePatronalRecordDto } from '../dto/update-patronal-record.dto';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';

@Injectable()
export class PatronalRecordsService {
    constructor(private readonly prisma: PrismaService) { }

    private readonly logger = new Logger(PatronalRecordsService.name);

    async findAll(idEmpresa: number, page: number, limit: number, query: string, user: ActiveUserDto) {
    if (!user.idTenant) {
        throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }
    const idTenant = user.idTenant;
        const offset = (page - 1) * limit;
        const searchPattern = `%${query}%`;

        const patronalRecords = await this.prisma.$queryRaw<any[]>`
        SELECT 
            rp.idRegistroPatronal,
            rp.idEmpresa,
            rp.RegistroPatronal,
            rp.RazonSocial,
            rp.ClaseRiesgo,
            rp.PrimaRiesgo,
            rp.Activo,
            COUNT(s.idSite) AS totalSites
        FROM CatRegistrosPatronales rp
        LEFT JOIN CatSites s ON rp.idRegistroPatronal = s.idRegistroPatronal AND s.Activo = 1
        WHERE rp.idEmpresa = ${idEmpresa} 
          AND rp.idTenant = ${idTenant}
          AND (${query} = '' OR rp.RegistroPatronal LIKE ${searchPattern} OR rp.RazonSocial LIKE ${searchPattern})
        GROUP BY rp.idRegistroPatronal
        ORDER BY rp.idRegistroPatronal DESC
        LIMIT ${limit} OFFSET ${offset};
    `;

     const countResult = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS total
        FROM CatRegistrosPatronales rp
        WHERE rp.idEmpresa = ${idEmpresa} 
        AND rp.idTenant = ${idTenant}
        AND (${query} = '' OR rp.RegistroPatronal LIKE ${searchPattern} OR rp.RazonSocial LIKE ${searchPattern});
        `;
        const total = countResult[0]?.total ? Number(countResult[0].total) : 0;
        if ((!patronalRecords || patronalRecords.length === 0) && page === 1 && !query) {
            return {
                patronalRecords: [],
                total: 0,
                currentPage: page,
                totalPages: 1,
            };
        }

        const formattedRecords = patronalRecords.map(record => ({
            ...record,
            idRegistroPatronal: Number(record.idRegistroPatronal),
            idEmpresa: Number(record.idEmpresa),
            PrimaRiesgo: parseFloat(record.PrimaRiesgo),
            totalSites: Number(record.totalSites)
        }));

        return {
            patronalRecords: formattedRecords,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }

     async findOne(idEmpresa: number, idRegistroPatronal: number, user: ActiveUserDto) {   
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
       const patronalRecord = await this.prisma.catRegistrosPatronales.findFirst({
       where: { idRegistroPatronal, idEmpresa, idTenant: user.idTenant },
        });
        if (!patronalRecord) {
            throw new NotFoundException('El registro patronal no existe.');
        }
        return patronalRecord;
    }

     async create(idEmpresa: number, dto: CreatePatronalRecordDto, user: ActiveUserDto) {   
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant; 
        const companyExists = await this.prisma.catEmpresas.findUnique({
            where: { idEmpresa },
        });
        if (!companyExists) throw new NotFoundException('La empresa especificada no existe.');
            if (companyExists.idTenant !== idTenant) {   
                throw new NotFoundException('La empresa especificada no existe.');
            }
        const registroPatronalUnico = dto.registroPatronal.toUpperCase().trim();
        const recordExists = await this.prisma.catRegistrosPatronales.findFirst({
            where: { RegistroPatronal: registroPatronalUnico}
        });
        if (recordExists) {
            throw new ConflictException(`El registro patronal ${registroPatronalUnico} ya se encuentra registrado.`);
        }

        try {
            const nuevoRegistro = await this.prisma.catRegistrosPatronales.create({
                data: {
                    idEmpresa,
                     idTenant,
                    RegistroPatronal: registroPatronalUnico,
                    RazonSocial: dto.razonSocial.toUpperCase().trim(),
                    ClaseRiesgo: dto.claseRiesgo,
                    PrimaRiesgo: dto.primaRiesgo,
                    Activo: (dto.activo === true || (dto.activo as any) === 1) ?? true
                },
            });

            return { message: 'Registro Patronal creado correctamente' };

        } catch (error:any) {
            this.logger.error(`Error al insertar Registro Patronal en Prisma: ${error.message}`);
            throw new InternalServerErrorException('Error interno al intentar dar de alta el registro patronal.');
        }
    }

    async update(companyId: number, idRegistroPatronal: number, dto: UpdatePatronalRecordDto, user: ActiveUserDto) {
    if (!user.idTenant) {
        throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }
       const recordExists = await this.prisma.catRegistrosPatronales.findFirst({
        where: { idRegistroPatronal, idEmpresa: companyId, idTenant: user.idTenant },
    });
        if (!recordExists) throw new NotFoundException('El registro patronal especificado no existe.');

        if (dto.registroPatronal) {
            const registroPatronalUnico = dto.registroPatronal.toUpperCase().trim();
            const duplicateCheck = await this.prisma.catRegistrosPatronales.findFirst({
                where: {
                    RegistroPatronal: registroPatronalUnico,
                    NOT: { idRegistroPatronal }
                }
            });
            if (duplicateCheck) {
                throw new ConflictException(`El registro patronal ${registroPatronalUnico} ya está asignado a otra razón social.`);
            }
        }

        try {
            const updatedRecord = await this.prisma.catRegistrosPatronales.update({
                where: { idRegistroPatronal },
                data: {
                    ...(dto.registroPatronal && { RegistroPatronal: dto.registroPatronal.toUpperCase().trim() }),
                    ...(dto.razonSocial && { RazonSocial: dto.razonSocial.toUpperCase().trim() }),
                    ...(dto.claseRiesgo && { ClaseRiesgo: dto.claseRiesgo }),
                    ...(dto.primaRiesgo !== undefined && { PrimaRiesgo: dto.primaRiesgo }),
                    ...(dto.activo !== undefined && {
                        Activo: dto.activo === true || (dto.activo as any) === 1
                    }),
                },
            });

            return { message: 'Registro Patronal actualizado correctamente' };
        } catch (error:any) {
            this.logger.error(`Error al actualizar Registro Patronal ${idRegistroPatronal}: ${error.message}`);
            throw new InternalServerErrorException('Error interno al intentar guardar los cambios del registro patronal.');
        }
    }

    async changeStatus(companyId: number, id: number, active: boolean, user: ActiveUserDto) {
    if (!user.idTenant) {
        throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }

    const recordExists = await this.prisma.catRegistrosPatronales.findFirst({
        where: { idRegistroPatronal: id, idEmpresa: companyId, idTenant: user.idTenant },
    });
    if (!recordExists) throw new NotFoundException('El registro patronal especificado no existe.');

    await this.prisma.catRegistrosPatronales.update({
        where: { idRegistroPatronal: id, idEmpresa: companyId },   
        data: {
            Activo: active
        },
    });

    return {
        message: active ? 'Registro patronal activado correctamente' : 'Registro patronal desactivado correctamente'
    };
}
}