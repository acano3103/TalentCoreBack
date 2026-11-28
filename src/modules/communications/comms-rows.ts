export function leerCampo(fila: object, nombre: string): unknown {
    const registro = fila as Record<string, unknown>;
    if (nombre in registro) return registro[nombre];
    const clave = Object.keys(registro).find((item) => item.toLowerCase() === nombre.toLowerCase());
    return clave ? registro[clave] : undefined;
}

export function leerNumero(fila: object, nombre: string): number {
    const valor = leerCampo(fila, nombre);
    if (typeof valor === 'bigint') return Number(valor);
    if (typeof valor === 'number') return valor;
    if (typeof valor === 'string' && valor.trim() !== '') return Number(valor);
    return 0;
}

export function leerTexto(fila: object, nombre: string): string | null {
    const valor = leerCampo(fila, nombre);
    return typeof valor === 'string' ? valor : valor == null ? null : String(valor);
}

export function leerBandera(fila: object, nombre: string): boolean {
    const valor = leerCampo(fila, nombre);
    return valor === true || valor === 1 || valor === 1n || valor === '1';
}
