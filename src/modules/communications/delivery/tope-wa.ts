/** CRÍTICA siempre pasa. El tope con acción BLOQUEAR solo frena el resto al 100 %. */
export function whatsappBloqueado(entrada: {
    prioridad: string;
    consumo: number;
    tope: number | null;
    accion: string | null;
}): boolean {
    if (entrada.prioridad === 'CRITICA') return false;
    if (entrada.tope == null) return false;
    if ((entrada.accion ?? 'BLOQUEAR').trim().toUpperCase() !== 'BLOQUEAR') return false;
    return entrada.consumo >= entrada.tope;
}
