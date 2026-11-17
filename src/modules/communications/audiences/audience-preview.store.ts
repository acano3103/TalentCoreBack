import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

export const TTL_PREVIEW_SEGUNDOS = 15 * 60;
const TIMEOUT_REDIS_MS = 2_000;
const PREFIJO = 'comms:preview:';

export interface PreviewGuardado {
    idTenant: number;
    companyId: number;
    idUsuario: number;
    ids: number[];
}

export abstract class AudiencePreviewStore {
    abstract guardar(previewId: string, datos: PreviewGuardado): Promise<void>;
    abstract leer(previewId: string): Promise<PreviewGuardado | null>;
}

@Injectable()
export class MemoryAudiencePreviewStore extends AudiencePreviewStore {
    private readonly entradas = new Map<string, { vence: number; datos: PreviewGuardado }>();

    async guardar(previewId: string, datos: PreviewGuardado): Promise<void> {
        this.purgar();
        this.entradas.set(previewId, { vence: Date.now() + TTL_PREVIEW_SEGUNDOS * 1000, datos });
    }

    async leer(previewId: string): Promise<PreviewGuardado | null> {
        const entrada = this.entradas.get(previewId);
        if (!entrada) return null;
        if (entrada.vence <= Date.now()) {
            this.entradas.delete(previewId);
            return null;
        }
        return entrada.datos;
    }

    private purgar(): void {
        const ahora = Date.now();
        for (const [clave, entrada] of this.entradas) {
            if (entrada.vence <= ahora) this.entradas.delete(clave);
        }
    }
}

export class RedisAudiencePreviewStore extends AudiencePreviewStore implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisAudiencePreviewStore.name);
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
                `Redis no responde en ${this.destino}. La vista previa se entregará sin id hasta que la cola esté disponible.`,
            );
        }
    }

    async guardar(previewId: string, datos: PreviewGuardado): Promise<void> {
        await this.listo();
        await this.redis.set(`${PREFIJO}${previewId}`, JSON.stringify(datos), 'EX', TTL_PREVIEW_SEGUNDOS);
    }

    async leer(previewId: string): Promise<PreviewGuardado | null> {
        await this.listo();
        const crudo = await this.redis.get(`${PREFIJO}${previewId}`);
        if (!crudo) return null;
        return parsear(crudo);
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

export function crearPreviewStore(redisUrl: string | undefined): AudiencePreviewStore {
    if (!redisUrl) {
        new Logger('AudiencePreviewStore').warn(
            'REDIS_URL no está definido: la vista previa de audiencias vive en la memoria de este proceso.',
        );
        return new MemoryAudiencePreviewStore();
    }
    return new RedisAudiencePreviewStore(redisUrl);
}

function destinoRedis(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.hostname}:${parsed.port || '6379'}`;
    } catch {
        return 'la URL configurada';
    }
}

function parsear(crudo: string): PreviewGuardado | null {
    try {
        const valor: unknown = JSON.parse(crudo);
        if (!valor || typeof valor !== 'object') return null;
        const fila = valor as Partial<PreviewGuardado>;
        if (!Array.isArray(fila.ids) || typeof fila.idTenant !== 'number' || typeof fila.companyId !== 'number') {
            return null;
        }
        return {
            idTenant: fila.idTenant,
            companyId: fila.companyId,
            idUsuario: Number(fila.idUsuario),
            ids: fila.ids.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0),
        };
    } catch {
        return null;
    }
}
