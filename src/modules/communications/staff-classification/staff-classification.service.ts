import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { errorComms, esP2002 } from '../comms-http';
import { CreateStaffTypeDto } from './dto/create-staff-type.dto';
import { UpdateStaffTypeDto } from './dto/update-staff-type.dto';

export interface TipoPersonalRespuesta {
    id: number;
    codigo: string;
    nombre: string;
    activo: boolean;
}

interface FilaTipoPersonal {
    idTipoPersonal: number;
    Codigo: string;
    Nombre: string;
    Activo: boolean;
}

@Injectable()
export class StaffClassificationService {
    constructor(private readonly prisma: PrismaService) {}

    async listar(idTenant: number, companyId: number): Promise<TipoPersonalRespuesta[]> {
        this.assertEmpresa(companyId);
        const filas = await this.prisma.catTiposPersonal.findMany({
            where: { idTenant },
            orderBy: { Nombre: 'asc' },
        });
        return filas.map(aTipoPersonal);
    }

    async crear(idTenant: number, companyId: number, dto: CreateStaffTypeDto): Promise<TipoPersonalRespuesta> {
        this.assertEmpresa(companyId);
        const codigo = dto.codigo;
        const duplicado = await this.prisma.catTiposPersonal.findFirst({
            where: { idTenant, Codigo: codigo },
            select: { idTipoPersonal: true },
        });
        if (duplicado) {
            throw errorComms(HttpStatus.CONFLICT, 'CODIGO_DUPLICADO', 'Ya existe un tipo de personal con ese código.');
        }

        try {
            const creado = await this.prisma.catTiposPersonal.create({
                data: {
                    idTenant,
                    Codigo: codigo,
                    Nombre: dto.nombre,
                    Activo: dto.activo ?? true,
                },
            });
            return aTipoPersonal(creado);
        } catch (error) {
            if (!esP2002(error)) throw error;
            throw errorComms(HttpStatus.CONFLICT, 'CODIGO_DUPLICADO', 'Ya existe un tipo de personal con ese código.');
        }
    }

    async actualizar(
        idTenant: number,
        companyId: number,
        idTipoPersonal: number,
        dto: UpdateStaffTypeDto,
    ): Promise<TipoPersonalRespuesta> {
        this.assertEmpresa(companyId);
        if (dto.codigo === undefined && dto.nombre === undefined && dto.activo === undefined) {
            throw errorComms(
                HttpStatus.BAD_REQUEST,
                'CONTENIDO_INVALIDO',
                'Indica el código, el nombre o el estado que deseas cambiar.',
            );
        }

        const actual = await this.prisma.catTiposPersonal.findFirst({
            where: { idTipoPersonal, idTenant },
        });
        if (!actual) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos ese tipo de personal.');
        }

        if (dto.codigo !== undefined && dto.codigo !== actual.Codigo) {
            const duplicado = await this.prisma.catTiposPersonal.findFirst({
                where: { idTenant, Codigo: dto.codigo, NOT: { idTipoPersonal } },
                select: { idTipoPersonal: true },
            });
            if (duplicado) {
                throw errorComms(HttpStatus.CONFLICT, 'CODIGO_DUPLICADO', 'Ya existe un tipo de personal con ese código.');
            }
        }

        try {
            const actualizado = await this.prisma.catTiposPersonal.update({
                where: { idTipoPersonal },
                data: {
                    ...(dto.codigo !== undefined ? { Codigo: dto.codigo } : {}),
                    ...(dto.nombre !== undefined ? { Nombre: dto.nombre } : {}),
                    ...(dto.activo !== undefined ? { Activo: dto.activo } : {}),
                },
            });
            return aTipoPersonal(actualizado);
        } catch (error) {
            if (!esP2002(error)) throw error;
            throw errorComms(HttpStatus.CONFLICT, 'CODIGO_DUPLICADO', 'Ya existe un tipo de personal con ese código.');
        }
    }

    private assertEmpresa(companyId: number): void {
        if (!Number.isInteger(companyId) || companyId <= 0) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'La empresa no es válida.');
        }
    }
}

function aTipoPersonal(fila: FilaTipoPersonal): TipoPersonalRespuesta {
    return {
        id: fila.idTipoPersonal,
        codigo: fila.Codigo,
        nombre: fila.Nombre,
        activo: fila.Activo,
    };
}
