import { Canal } from '../channels/canales';

export const LIMITE_AVISOS_DIA = 10;

export interface PersonaPlan {
    canales: readonly string[];
    telefono: boolean;
}

export interface PlanEquipo {
    total: number;
    conApp: number;
    soloWeb: number;
    porWhatsApp: number;
    sinCanal: number;
}

/**
 * El aviso de equipo usa los canales del perfil.
 * WhatsApp solo se suma a quien no tiene la app, si el jefe lo pidió y la política lo permite.
 */
export function planEquipo(personas: readonly PersonaPlan[], whatsappSinApp: boolean, politicaPermite: boolean): PlanEquipo {
    let conApp = 0;
    let soloWeb = 0;
    let porWhatsApp = 0;
    let sinCanal = 0;
    for (const persona of personas) {
        const app = persona.canales.includes('APP');
        const web = persona.canales.includes('WEB');
        const correo = persona.canales.includes('CORREO');
        const kiosco = persona.canales.includes('KIOSCO');
        const wa = whatsappSinApp && politicaPermite && !app && persona.telefono;
        if (app) conApp += 1;
        if (web && !app) soloWeb += 1;
        if (wa) porWhatsApp += 1;
        if (!app && !web && !correo && !kiosco && !wa) sinCanal += 1;
    }
    return { total: personas.length, conApp, soloWeb, porWhatsApp, sinCanal };
}

export function canalesConWhatsapp(canales: readonly string[], telefono: boolean, whatsappSinApp: boolean, politicaPermite: boolean): Canal[] {
    const lista = canales.filter((canal): canal is Canal => canal === 'APP' || canal === 'WEB' || canal === 'WHATSAPP' || canal === 'CORREO' || canal === 'KIOSCO');
    const sinWhatsapp = lista.filter((canal) => canal !== 'WHATSAPP');
    const suma = whatsappSinApp && politicaPermite && telefono && !sinWhatsapp.includes('APP');
    return suma ? [...sinWhatsapp, 'WHATSAPP'] : sinWhatsapp;
}

export function htmlDeTextoPlano(texto: string): string {
    const limpio = texto.replace(/\r\n/g, '\n').trim();
    const parrafos = limpio.split(/\n{2,}/).map((parte) => parte.trim()).filter(Boolean);
    return parrafos.map((parrafo) => `<p>${escaparHtml(parrafo).replace(/\n/g, '<br>')}</p>`).join('');
}

export function resumenDe(texto: string, limite = 200): string {
    return texto.replace(/\s+/g, ' ').trim().slice(0, limite);
}

function escaparHtml(valor: string): string {
    return valor
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
