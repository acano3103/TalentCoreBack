import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export const TTL_PREVIEW_SEGUNDOS = 15 * 60;
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

export class RedisAudiencePreviewStore extends AudiencePreviewStore implements OnModuleDestroy {
    private readonly redis: Redis;

    constructor(url: string) {
        super();
        this.redis = new Redis(url, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
        });
    }

    async guardar(previewId: string, datos: PreviewGuardado): Promise<void> {
        await this.redis.set(`${PREFIJO}${previewId}`, JSON.stringify(datos), 'EX', TTL_PREVIEW_SEGUNDOS);
    }

    async leer(previewId: string): Promise<PreviewGuardado | null> {
        const crudo = await this.redis.get(`${PREFIJO}${previewId}`);
        if (!crudo) return null;
        return parsear(crudo);
    }

    async onModuleDestroy(): Promise<void> {
        await this.redis.quit().catch(() => undefined);
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
