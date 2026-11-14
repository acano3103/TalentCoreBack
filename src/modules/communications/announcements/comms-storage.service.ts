import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import { firmarRuta, leerFirma, TTL_FIRMA_MAX_SEG } from './comms-firma';

export interface DestinoArchivo {
    tenant: number;
    empresa: number;
    carpeta: string;
    nombre: string;
    mime: string;
}

export interface ArchivoLeido {
    buffer: Buffer;
    mime: string;
    nombre: string;
}

@Injectable()
export class CommsStorageService {
    constructor(private readonly config: ConfigService) {}

    async put(buffer: Buffer, destino: DestinoArchivo): Promise<string> {
        const relativa = rutaRelativa(destino);
        const absoluto = this.resolver(relativa);
        await mkdir(resolve(absoluto, '..'), { recursive: true });
        await writeFile(absoluto, buffer);
        return relativa.split(sep).join('/');
    }

    async get(ruta: string): Promise<Buffer> {
        return readFile(this.resolver(ruta));
    }

    async delete(ruta: string): Promise<void> {
        await rm(this.resolver(ruta), { force: true });
    }

    signedUrl(ruta: string, ttlSegundos: number, mime = 'application/octet-stream'): string {
        const ttl = Math.min(Math.max(1, Math.floor(ttlSegundos)), TTL_FIRMA_MAX_SEG);
        const expiraEn = Math.floor(Date.now() / 1000) + ttl;
        const firma = firmarRuta(ruta, expiraEn, mime, this.secreto());
        const base = (this.config.get<string>('COMMS_PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
        const path = `/api/v2/public/comms/files/${firma}`;
        return base ? `${base}${path}` : path;
    }

    async abrirFirmado(firma: string): Promise<ArchivoLeido | 'invalida' | 'expirada'> {
        const carga = leerFirma(firma, this.secreto(), Math.floor(Date.now() / 1000));
        if (carga === 'invalida' || carga === 'expirada') return carga;
        try {
            const buffer = await this.get(carga.ruta);
            const nombre = carga.ruta.split('/').pop() ?? 'archivo';
            return { buffer, mime: carga.mime, nombre };
        } catch {
            return 'invalida';
        }
    }

    private resolver(ruta: string): string {
        const raiz = resolve(this.base());
        const destino = resolve(raiz, ruta);
        const relativo = relative(raiz, destino);
        if (!relativo || relativo.startsWith('..') || isAbsolute(relativo)) {
            throw new Error('La ruta queda fuera de la carpeta de comunicados.');
        }
        return destino;
    }

    private base(): string {
        return this.config.get<string>('COMMS_MEDIA_BASE_PATH') || 'comms-media';
    }

    private secreto(): string {
        return this.config.get<string>('JWT_SECRET') || 'comms-dev';
    }
}

export function nombreAlmacenado(nombre: string): string {
    const base = (nombre.split(/[/\\]/).pop() ?? 'archivo').replace(/[^\w.\-]/g, '_').slice(0, 80);
    return `${randomUUID()}-${base || 'archivo'}`;
}

function rutaRelativa(destino: DestinoArchivo): string {
    const carpeta = destino.carpeta.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!carpeta || carpeta.split('/').some((parte) => parte === '..' || parte === '.')) {
        throw new Error('La carpeta del archivo no es válida.');
    }
    return join(String(destino.tenant), String(destino.empresa), 'comms', carpeta, destino.nombre);
}
