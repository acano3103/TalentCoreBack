import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { errorComms, esP2002 } from '../comms-http';
import { mismaEtiqueta, normalizarNombreEtiqueta } from './etiqueta-nombre';

export interface EtiquetaRespuesta {
    id: number;
    nombre: string;
    activo: boolean;
    yaExistia?: boolean;
}

const LIMITE_BUSQUEDA = 20;

@Injectable()
export class PositionTagsService {
    constructor(private readonly prisma: PrismaService) {}

    async buscar(idTenant: number, companyId: number, search?: string): Promise<Omit<EtiquetaRespuesta, 'yaExistia'>[]> {
        this.assertEmpresa(companyId);
        const termino = normalizarNombreEtiqueta(search ?? '').replace(/[%_\\]/g, '').slice(0, 60);
        const filas = await this.prisma.catEtiquetasPuesto.findMany({
            where: {
                idTenant,
                Activo: true,
                ...(termino ? { Nombre: { contains: termino } } : {}),
            },
            orderBy: { Nombre: 'asc' },
            take: LIMITE_BUSQUEDA,
            select: { idEtiqueta: true, Nombre: true, Activo: true },
        });
        return filas.map((fila) => ({
            id: fila.idEtiqueta,
            nombre: fila.Nombre,
            activo: fila.Activo,
        }));
    }

    async crear(idTenant: number, companyId: number, nombre: string): Promise<EtiquetaRespuesta> {
        this.assertEmpresa(companyId);
        const limpio = normalizarNombreEtiqueta(nombre);
        if (!limpio) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'El nombre de la etiqueta es obligatorio.');
        }
        if (limpio.length > 60) {
            throw errorComms(
                HttpStatus.BAD_REQUEST,
                'CONTENIDO_INVALIDO',
                'El nombre de la etiqueta no puede pasar de 60 caracteres.',
            );
        }

        const existentes = await this.prisma.catEtiquetasPuesto.findMany({
            where: { idTenant },
            select: { idEtiqueta: true, Nombre: true, Activo: true },
        });
        const previa = existentes.find((fila) => mismaEtiqueta(fila.Nombre, limpio));
        if (previa) {
            return { id: previa.idEtiqueta, nombre: previa.Nombre, activo: previa.Activo, yaExistia: true };
        }

        try {
            const creada = await this.prisma.catEtiquetasPuesto.create({
                data: { idTenant, Nombre: limpio, Activo: true },
            });
            return { id: creada.idEtiqueta, nombre: creada.Nombre, activo: creada.Activo, yaExistia: false };
        } catch (error) {
            if (!esP2002(error)) throw error;
            const deNuevo = await this.prisma.catEtiquetasPuesto.findFirst({
                where: { idTenant, Nombre: limpio },
            });
            if (!deNuevo) throw error;
            return { id: deNuevo.idEtiqueta, nombre: deNuevo.Nombre, activo: deNuevo.Activo, yaExistia: true };
        }
    }

    private assertEmpresa(companyId: number): void {
        if (!Number.isInteger(companyId) || companyId <= 0) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'La empresa no es válida.');
        }
    }
}
