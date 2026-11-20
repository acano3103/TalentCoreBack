import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

const PREFIJO = 'comms:snooze:';
const TIMEOUT_REDIS_MS = 2_000;
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

export class RedisSnoozeStore extends SnoozeStore implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisSnoozeStore.name);
    private readonly redis: Redis;
    private readonly destino: string;

    constructor(url: string) {
        super();
        this.destino = destinoRedis(url);
        this.redis = new Redis(url, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            connectTimeout: TIMEOUT_REDIS_MS,
            commandTimeout: TIMEOUT_REDIS_MS,
            enableOfflineQueue: true,
        });
        this.redis.on('error', () => undefined);
    }

    async onModuleInit(): Promise<void> {
        try {
            await this.listo();
        } catch {
            this.logger.warn(
                `Redis no responde en ${this.destino}. Recordarme más tarde no podrá guardarse hasta que la cola esté disponible.`,
            );
        }
    }

    async ocultar(idEmpleado: number, dia: string, idComunicado: number): Promise<void> {
        await this.listo();
        const clave = claveSnooze(idEmpleado, dia);
        const previos = parsearIds(await this.redis.get(clave));
        previos.add(idComunicado);
        await this.redis.set(clave, JSON.stringify([...previos]), 'EX', TTL_SNOOZE_SEGUNDOS);
    }

    async ids(idEmpleado: number, dia: string): Promise<number[]> {
        await this.listo();
        return [...parsearIds(await this.redis.get(claveSnooze(idEmpleado, dia)))];
    }

    async onModuleDestroy(): Promise<void> {
        await this.redis.quit().catch(() => undefined);
    }

    private async listo(): Promise<void> {
        if (this.redis.status !== 'wait' && this.redis.status !== 'end') return;
        try {
            await this.redis.connect();
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : '';
            if (mensaje.includes('already connecting')) return;
            throw error;
        }
    }
}

export function crearSnoozeStore(redisUrl: string | undefined): SnoozeStore {
    if (!redisUrl) {
        new Logger('SnoozeStore').warn('REDIS_URL no está definido: el snooze del modal vive en la memoria de este proceso.');
        return new MemorySnoozeStore();
    }
    return new RedisSnoozeStore(redisUrl);
}

function destinoRedis(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.hostname}:${parsed.port || '6379'}`;
    } catch {
        return 'la URL configurada';
    }
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
