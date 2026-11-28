import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const DIAS_ENLACE = 7;

/** 32 bytes aleatorios. En base se guarda solo el sha256. */
export function nuevoTokenEnlace(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/** La vigencia del comunicado, o 7 días si no tiene. */
export function expiracionEnlace(vigenteHasta: Date | null, ahora: Date): Date {
    if (vigenteHasta && vigenteHasta.getTime() > ahora.getTime()) return vigenteHasta;
    return new Date(ahora.getTime() + DIAS_ENLACE * 24 * 60 * 60 * 1000);
}

export function urlEnlace(base: string, token: string): string {
    const limpia = base.replace(/\/+$/, '');
    return `${limpia}/public/comms/links/${token}`;
}

export function clavesCoinciden(recibida: string, esperada: string): boolean {
    const a = Buffer.from(recibida);
    const b = Buffer.from(esperada);
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}
