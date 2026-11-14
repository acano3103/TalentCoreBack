import { Injectable } from '@nestjs/common';

export const LIMITE_IP = 20;
export const LIMITE_TOKEN = 10;
export const VENTANA_MS = 60_000;

@Injectable()
export class LinkThrottle {
    private readonly marcas = new Map<string, number[]>();

    permitir(ip: string, token: string, ahora = Date.now()): boolean {
        const ipOk = this.consumir(`ip:${ip || 'desconocida'}`, LIMITE_IP, ahora);
        const tokenOk = this.consumir(`token:${token.slice(0, 128) || 'vacio'}`, LIMITE_TOKEN, ahora);
        return ipOk && tokenOk;
    }

    reiniciar(): void {
        this.marcas.clear();
    }

    private consumir(clave: string, limite: number, ahora: number): boolean {
        const previas = (this.marcas.get(clave) ?? []).filter((marca) => ahora - marca < VENTANA_MS);
        if (previas.length >= limite) {
            this.marcas.set(clave, previas);
            return false;
        }
        previas.push(ahora);
        this.marcas.set(clave, previas);
        return true;
    }
}
