export interface FilaPrecioWa {
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
    const elegido = pool.reduce((mejor, fila) => (fila.vigenteDesde.getTime() > mejor.vigenteDesde.getTime() ? fila : mejor));
    const deCategoria = leerCategoria(elegido.preciosCategoria, categoria);
    return {
        precio: deCategoria ?? elegido.precioBase,
        moneda: elegido.moneda?.trim() || 'MXN',
    };
}

function leerCategoria(valor: unknown, categoria: string): number | null {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
    const crudo = (valor as Record<string, unknown>)[categoria];
    const numero = typeof crudo === 'number' ? crudo : typeof crudo === 'string' ? Number(crudo) : NaN;
    return Number.isFinite(numero) ? numero : null;
}
