export interface EtiquetaPuesto {
    id: number;
    nombre: string;
}

export interface TipoPersonalPuesto {
    id: number;
    codigo: string;
    nombre: string;
}

export function presentarTipoPersonal(
    id: number | bigint | null | undefined,
    codigo: string | null | undefined,
    nombre: string | null | undefined,
): TipoPersonalPuesto | null {
    if (id == null) return null;
    return { id: Number(id), codigo: codigo ?? '', nombre: nombre ?? '' };
}

export function presentarEtiquetas(etiquetas: EtiquetaPuesto[]): EtiquetaPuesto[] {
    return [...etiquetas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id - b.id);
}

export function adjuntarClasificacionEnFila<T extends Record<string, unknown>>(
    row: T,
    etiquetas: EtiquetaPuesto[],
) {
    const {
        idTipoPersonalClasificacion,
        codigoTipoPersonal,
        nombreTipoPersonal,
        ...resto
    } = row as T & {
        idTipoPersonalClasificacion?: number | bigint | null;
        codigoTipoPersonal?: string | null;
        nombreTipoPersonal?: string | null;
    };
    return {
        ...resto,
        tipoPersonal: presentarTipoPersonal(idTipoPersonalClasificacion, codigoTipoPersonal, nombreTipoPersonal),
        etiquetas: presentarEtiquetas(etiquetas),
    };
}

export function presentarPuesto<T extends {
    CatTiposPersonal: { idTipoPersonal: number; Codigo: string; Nombre: string } | null;
    RelPuestoEtiqueta: { CatEtiquetasPuesto: { idEtiqueta: number; Nombre: string } }[];
}>(position: T) {
    const { CatTiposPersonal, RelPuestoEtiqueta, ...resto } = position;
    return {
        ...resto,
        tipoPersonal: presentarTipoPersonal(
            CatTiposPersonal?.idTipoPersonal,
            CatTiposPersonal?.Codigo,
            CatTiposPersonal?.Nombre,
        ),
        etiquetas: presentarEtiquetas(
            RelPuestoEtiqueta.map((relacion) => ({
                id: relacion.CatEtiquetasPuesto.idEtiqueta,
                nombre: relacion.CatEtiquetasPuesto.Nombre,
            })),
        ),
    };
}
