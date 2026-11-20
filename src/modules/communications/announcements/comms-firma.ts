import { createHmac, timingSafeEqual } from 'crypto';

export const TTL_FIRMA_MAX_SEG = 7 * 24 * 60 * 60;

export interface CargaFirma {
    ruta: string;
    expiraEn: number;
    mime: string;
}

export function firmarRuta(ruta: string, expiraEn: number, mime: string, secreto: string): string {
    const cuerpo = Buffer.from(JSON.stringify({ r: ruta, e: expiraEn, m: mime }), 'utf8').toString('base64url');
    const mac = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
    return `${cuerpo}.${mac}`;
}

export function leerFirma(firma: string, secreto: string, ahoraSeg: number): CargaFirma | 'invalida' | 'expirada' {
    const punto = firma.indexOf('.');
    if (punto <= 0 || punto !== firma.lastIndexOf('.')) return 'invalida';
    const cuerpo = firma.slice(0, punto);
    const mac = firma.slice(punto + 1);
    const esperada = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
    const a = Buffer.from(mac);
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return 'invalida';
    let json: unknown;
    try {
        json = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    } catch {
        return 'invalida';
    }
    if (!json || typeof json !== 'object') return 'invalida';
    const ruta = (json as { r?: unknown }).r;
    const expiraEn = (json as { e?: unknown }).e;
    const mime = (json as { m?: unknown }).m;
    if (typeof ruta !== 'string' || !ruta || ruta.includes('..') || typeof expiraEn !== 'number' || typeof mime !== 'string') {
        return 'invalida';
    }
    if (expiraEn <= ahoraSeg) return 'expirada';
    return { ruta, expiraEn, mime };
}
