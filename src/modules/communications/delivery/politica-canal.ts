import { Canal, esCanal, politicaPermiteWhatsapp } from '../channels/canales';

/** IMPORTANTE_CRITICA deja WhatsApp en el perfil; aquí se decide si esta prioridad lo usa. */
export function canalesParaEnvio(
    efectivos: readonly string[],
    forzados: readonly string[] | null,
    prioridad: string,
    politica: string,
): Canal[] {
    const base = efectivos.filter(esCanal);
    const lista = forzados && forzados.length ? base.filter((canal) => forzados.includes(canal)) : base;
    return lista.filter((canal) => canal !== 'WHATSAPP' || whatsappDePrioridad(prioridad, politica));
}

export function whatsappDePrioridad(prioridad: string, politica: string): boolean {
    if (!politicaPermiteWhatsapp(politica)) return false;
    const valor = (politica || 'IMPORTANTE_CRITICA').trim().toUpperCase();
    if (valor === 'SIEMPRE' || valor === 'TODOS' || valor === 'TODAS') return true;
    if (valor === 'CRITICA' || valor === 'SOLO_CRITICA') return prioridad === 'CRITICA';
    if (valor === 'IMPORTANTE_CRITICA') return prioridad === 'IMPORTANTE' || prioridad === 'CRITICA';
    return true;
}
