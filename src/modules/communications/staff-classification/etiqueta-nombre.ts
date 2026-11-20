/** Comparación de etiquetas: el catálogo es por tenant y el nombre no distingue mayúsculas. */
export function normalizarNombreEtiqueta(nombre: string): string {
    return nombre.trim().replace(/\s+/g, ' ');
}

export function mismaEtiqueta(a: string, b: string): boolean {
    return normalizarNombreEtiqueta(a).localeCompare(normalizarNombreEtiqueta(b), 'es', { sensitivity: 'accent' }) === 0;
}
