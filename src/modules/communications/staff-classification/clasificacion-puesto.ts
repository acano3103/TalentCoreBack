import { HttpStatus } from '@nestjs/common';
import { errorComms } from '../comms-http';

interface TxTipoPersonal {
    catTiposPersonal: {
        findFirst(args: {
            where: { idTipoPersonal: number; idTenant: number; Activo: boolean };
            select: { idTipoPersonal: true };
        }): Promise<{ idTipoPersonal: number } | null>;
    };
}

interface TxEtiquetas {
    catEtiquetasPuesto: {
        findMany(args: {
            where: { idTenant: number; idEtiqueta: { in: number[] }; Activo: boolean };
            select: { idEtiqueta: true };
        }): Promise<{ idEtiqueta: number }[]>;
    };
    relPuestoEtiqueta: {
        deleteMany(args: { where: { idPuesto: number } }): Promise<unknown>;
        createMany(args: { data: { idPuesto: number; idEtiqueta: number }[] }): Promise<unknown>;
    };
}

export async function asegurarTipoPersonal(
    tx: TxTipoPersonal,
    idTenant: number,
    idTipoPersonal: number,
): Promise<void> {
    const tipo = await tx.catTiposPersonal.findFirst({
        where: { idTipoPersonal, idTenant, Activo: true },
        select: { idTipoPersonal: true },
    });
    if (!tipo) {
        throw errorComms(
            HttpStatus.BAD_REQUEST,
            'CONTENIDO_INVALIDO',
            'El tipo de personal no existe o no está activo.',
        );
    }
}

/**
 * Reemplaza el set de RelPuestoEtiqueta del puesto.
 * `undefined` no toca las etiquetas (el front de puestos que aún no las manda sigue igual).
 * Un arreglo, aunque venga vacío, deja exactamente esos ids.
 */
export async function reemplazarEtiquetas(
    tx: TxEtiquetas,
    idPuesto: number,
    idTenant: number,
    etiquetas: number[] | undefined,
): Promise<void> {
    if (etiquetas === undefined) return;

    const ids = [...new Set(etiquetas)];
    if (ids.length > 0) {
        const encontradas = await tx.catEtiquetasPuesto.findMany({
            where: { idTenant, idEtiqueta: { in: ids }, Activo: true },
            select: { idEtiqueta: true },
        });
        const validos = new Set(encontradas.map((fila) => fila.idEtiqueta));
        const faltantes = ids.filter((id) => !validos.has(id));
        if (faltantes.length > 0) {
            throw errorComms(
                HttpStatus.BAD_REQUEST,
                'CONTENIDO_INVALIDO',
                'Hay etiquetas que no existen o no están activas.',
                { ids: faltantes },
            );
        }
    }

    await tx.relPuestoEtiqueta.deleteMany({ where: { idPuesto } });
    if (ids.length === 0) return;

    await tx.relPuestoEtiqueta.createMany({
        data: ids.map((idEtiqueta) => ({ idPuesto, idEtiqueta })),
    });
}
