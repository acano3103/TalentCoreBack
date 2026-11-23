import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { AddressInfo } from 'net';
import express from 'express';
import { NotFoundException } from '@nestjs/common';
import { resolvePackageFile, sendPackageFile } from './scorm-package-file.util';

describe('archivos del paquete SCORM', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'scorm-pkg-'));

    afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

    it('rechaza path traversal con ../ y con %2e%2e', () => {
        expect(() => resolvePackageFile(carpeta, '../secreto.txt')).toThrow(NotFoundException);
        expect(() => resolvePackageFile(carpeta, '%2e%2e/%2e%2e/secreto.txt')).toThrow(NotFoundException);
        expect(() => resolvePackageFile(carpeta, 'foo/../../fuera.txt')).toThrow(NotFoundException);
    });

    it('resuelve un archivo que se queda dentro de la carpeta', () => {
        expect(resolvePackageFile(carpeta, 'media/audio.mp3')).toBe(resolve(carpeta, 'media', 'audio.mp3'));
    });

    it('sendFile responde 206 cuando el cliente pide Range', async () => {
        const archivo = join(carpeta, 'audio.mp3');
        writeFileSync(archivo, Buffer.alloc(1000, 7));
        const app = express();
        app.get('/audio.mp3', (_req, res) => {
            void sendPackageFile(archivo, res, 'private, max-age=3600');
        });
        const server = createServer(app);
        await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
        try {
            const { port } = server.address() as AddressInfo;
            const respuesta = await fetch(`http://127.0.0.1:${port}/audio.mp3`, { headers: { Range: 'bytes=0-99' } });
            const cuerpo = Buffer.from(await respuesta.arrayBuffer());
            expect(respuesta.status).toBe(206);
            expect(respuesta.headers.get('content-range')).toBe('bytes 0-99/1000');
            expect(respuesta.headers.get('cache-control')).toBe('private, max-age=3600');
            expect(cuerpo).toHaveLength(100);
        } finally {
            await new Promise<void>((ok) => server.close(() => ok()));
        }
    });
});
