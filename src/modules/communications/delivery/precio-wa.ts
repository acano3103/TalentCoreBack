export interface FilaPrecioWa {
    id?: number;
    idTenant: number | null;
    precioBase: number;
    preciosCategoria: unknown;
    moneda: string;
    vigenteDesde: Date;
}

export interface PrecioWa {
    precio: number;
    moneda: string;
}

/**
 * Gana el precio del tenant sobre el global.
 * Entre los vigentes, el de VigenteDesde más reciente. Un cambio a mitad de mes no reescribe lo ya enviado.
 */
export function precioVigente(filas: readonly FilaPrecioWa[], idTenant: number, ahora: Date, categoria: string): PrecioWa | null {
    const vigentes = filas.filter(
        (fila) => fila.vigenteDesde.getTime() <= ahora.getTime() && (fila.idTenant === idTenant || fila.idTenant == null),
    );
    const delTenant = vigentes.filter((fila) => fila.idTenant === idTenant);
    const pool = delTenant.length ? delTenant : vigentes.filter((fila) => fila.idTenant == null);
    if (!pool.length) return null;
    const elegido = pool.reduce((mejor, fila) => (esMasNueva(fila, mejor) ? fila : mejor));
    const deCategoria = leerCategoria(elegido.preciosCategoria, categoria);
    return {
        precio: deCategoria ?? elegido.precioBase,
        moneda: elegido.moneda?.trim() || 'MXN',
    };
}

/** A igual vigencia gana el id más alto. Sin id se conserva el primero, como hasta ahora. */
function esMasNueva(candidata: FilaPrecioWa, actual: FilaPrecioWa): boolean {
    const delta = candidata.vigenteDesde.getTime() - actual.vigenteDesde.getTime();
    if (delta !== 0) return delta > 0;
    return (candidata.id ?? -1) > (actual.id ?? -1);
}

function leerCategoria(valor: unknown, categoria: string): number | null {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
    const crudo = (valor as Record<string, unknown>)[categoria];
    const numero = typeof crudo === 'number' ? crudo : typeof crudo === 'string' ? Number(crudo) : NaN;
    return Number.isFinite(numero) ? numero : null;
}
