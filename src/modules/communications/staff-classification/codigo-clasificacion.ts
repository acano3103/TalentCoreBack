export type CodigoTipoPersonal = 'OPERATIVO' | 'ADMINISTRATIVO' | 'DIRECTIVO';

/**
 * La clasificación del puesto (CatTipoPuesto) es la fuente de verdad.
 * Gerencial y Ejecutivo se tratan como Directivo: así venían catálogos anteriores.
 */
export function codigoTipoDeClasificacion(nombre: string | null): CodigoTipoPersonal | null {
    const normal = (nombre ?? '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
    if (normal === 'OPERATIVO') return 'OPERATIVO';
    if (normal === 'ADMINISTRATIVO') return 'ADMINISTRATIVO';
    if (normal === 'DIRECTIVO' || normal === 'GERENCIAL' || normal === 'EJECUTIVO') return 'DIRECTIVO';
    return null;
}
