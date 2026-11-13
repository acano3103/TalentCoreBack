import { Injectable } from '@nestjs/common';

const VENTANA_MS = 15 * 60 * 1000;
const LIMITE = 10;

export function ipDeSolicitud(req: {
    ip?: string;
    headers: Record<string, string | string[] | undefined>;
}): string {
    const realIp = req.headers['x-real-ip'];
    const forwarded = req.headers['x-forwarded-for'];
    const desdeReal = typeof realIp === 'string' ? realIp.trim() : '';
    const desdeForward = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
    return desdeReal || desdeForward || req.ip || 'desconocida';
}

/** Contador en memoria: 10 fallos de código por IP en 15 minutos. */
@Injectable()
export class KioskActivationRateLimiter {
    private readonly fallos = new Map<string, number[]>();

    bloqueada(ip: string, ahora = Date.now()): boolean {
        return this.vigentes(ip, ahora).length >= LIMITE;
    }

    registrarFallo(ip: string, ahora = Date.now()): void {
        const vigentes = this.vigentes(ip, ahora);
        vigentes.push(ahora);
        this.fallos.set(ip, vigentes);
    }

    reiniciar(): void {
        this.fallos.clear();
    }

    private vigentes(ip: string, ahora: number): number[] {
        const previas = this.fallos.get(ip) ?? [];
        return previas.filter((marca) => ahora - marca < VENTANA_MS);
    }
}
