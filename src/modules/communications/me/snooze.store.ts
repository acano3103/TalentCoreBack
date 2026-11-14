import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const PREFIJO = 'comms:snooze:';
export const TTL_SNOOZE_SEGUNDOS = 36 * 60 * 60;

export function claveSnooze(idEmpleado: number, dia: string): string {
    return `${PREFIJO}${idEmpleado}:${dia}`;
}

export abstract class SnoozeStore {
    abstract ocultar(idEmpleado: number, dia: string, idComunicado: number): Promise<void>;
    abstract ids(idEmpleado: number, dia: string): Promise<number[]>;
}

@Injectable()
export class MemorySnoozeStore extends SnoozeStore {
    private readonly dias = new Map<string, { vence: number; ids: Set<number> }>();

    async ocultar(idEmpleado: number, dia: string, idComunicado: number): Promise<void> {
        const clave = claveSnooze(idEmpleado, dia);
        const actual = this.vigente(clave) ?? new Set<number>();
        actual.add(idComunicado);
        this.dias.set(clave, { vence: Date.now() + TTL_SNOOZE_SEGUNDOS * 1000, ids: actual });
    }

    async ids(idEmpleado: number, dia: string): Promise<number[]> {
        const actual = this.vigente(claveSnooze(idEmpleado, dia));
        return actual ? [...actual] : [];
    }

    private vigente(clave: string): Set<number> | null {
        const entrada = this.dias.get(clave);
        if (!entrada) return null;
        if (entrada.vence <= Date.now()) {
            this.dias.delete(clave);
            return null;
        }
        return entrada.ids;
    }
}

export class RedisSnoozeStore extends SnoozeStore implements OnModuleDestroy {
    private readonly redis: Redis;

    constructor(url: string) {
        super();
        this.redis = new Redis(url, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
        });
    }

    async ocultar(idEmpleado: number, dia: string, idComunicado: number): Promise<void> {
        const cliente = await this.cliente();
        const clave = claveSnooze(idEmpleado, dia);
        const previos = parsearIds(await cliente.get(clave));
        previos.add(idComunicado);
        await cliente.set(clave, JSON.stringify([...previos]), 'EX', TTL_SNOOZE_SEGUNDOS);
    }

    async ids(idEmpleado: number, dia: string): Promise<number[]> {
        const cliente = await this.cliente();
        return [...parsearIds(await cliente.get(claveSnooze(idEmpleado, dia)))];
    }

    async onModuleDestroy(): Promise<void> {
        await this.redis.quit().catch(() => undefined);
    }

    private async cliente(): Promise<Redis> {
        if (this.redis.status === 'wait') await this.redis.connect();
        return this.redis;
    }
}

export function crearSnoozeStore(redisUrl: string | undefined): SnoozeStore {
    if (!redisUrl) {
        new Logger('SnoozeStore').warn('REDIS_URL no está definido: el snooze del modal vive en la memoria de este proceso.');
        return new MemorySnoozeStore();
    }
    return new RedisSnoozeStore(redisUrl);
}

function parsearIds(crudo: string | null): Set<number> {
    if (!crudo) return new Set();
    try {
        const valor: unknown = JSON.parse(crudo);
        if (!Array.isArray(valor)) return new Set();
        return new Set(valor.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0));
    } catch {
        return new Set();
    }
}
