
export function obtenerIniciales(nombre?: string, primerApellido?: string): string {
    const n = nombre ? nombre.trim().charAt(0).toUpperCase() : '';
    const a = primerApellido ? primerApellido.trim().charAt(0).toUpperCase() : '';
    return `${n}${a}` || 'EM';
}