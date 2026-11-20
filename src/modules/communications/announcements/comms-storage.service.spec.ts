import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { presentarAdjunto, presentarPortada } from './archivo-publico';
import { CommsStorageService } from './comms-storage.service';
import { firmarRuta } from './comms-firma';

describe('CommsStorageService', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'comms-'));
    const config = {
        get: (clave: string) => {
            if (clave === 'COMMS_MEDIA_BASE_PATH') return raiz;
            if (clave === 'JWT_SECRET') return 'secreto-prueba';
            if (clave === 'COMMS_PUBLIC_BASE_URL') return '';
            return undefined;
        },
    } as ConfigService;
    const storage = new CommsStorageService(config);

    afterAll(() => rmSync(raiz, { recursive: true, force: true }));

    it('guarda, lee y borra dentro de la carpeta del tenant', async () => {
        const ruta = await storage.put(Buffer.from('hola'), {
            tenant: 3,
            empresa: 10,
            carpeta: '9/adjuntos',
            nombre: 'nota.txt',
            mime: 'text/plain',
        });
        expect(ruta).toBe('3/10/comms/9/adjuntos/nota.txt');
        await expect(storage.get(ruta)).resolves.toEqual(Buffer.from('hola'));
        const url = storage.signedUrl(ruta, 60, 'text/plain');
        const firma = url.split('/').pop() ?? '';
        const abierto = await storage.abrirFirmado(firma);
        expect(abierto).toMatchObject({ mime: 'text/plain' });
        await storage.delete(ruta);
        await expect(storage.get(ruta)).rejects.toThrow();
    });

    it('rechaza una ruta que sale de la carpeta', async () => {
        await expect(
            storage.put(Buffer.from('x'), { tenant: 3, empresa: 10, carpeta: '../secreto', nombre: 'a.txt', mime: 'text/plain' }),
        ).rejects.toThrow(/carpeta/);
    });

    it('marca vencida una firma expirada', async () => {
        const firma = firmarRuta('3/10/comms/9/a.txt', 1, 'text/plain', 'secreto-prueba');
        await expect(storage.abrirFirmado(firma)).resolves.toBe('expirada');
    });

    it('sin base pública la respuesta trae ruta relativa a api/v2', () => {
        const portada = presentarPortada(storage, '3/10/comms/9/portada/foto.png', 60);
        expect(portada.portadaRuta).toMatch(/^public\/comms\/files\//);
        expect(portada.portadaUrl).toBe(`/api/v2/${portada.portadaRuta}`);
        const adjunto = presentarAdjunto(
            storage,
            { idAdjunto: 1, Nombre: 'Año.pdf', Mime: 'application/pdf', TamanoBytes: 4, Ruta: '3/10/comms/9/adjuntos/a.pdf' },
            60,
        );
        expect(adjunto.ruta).toMatch(/^public\/comms\/files\//);
        expect(adjunto.url).toBe(`/api/v2/${adjunto.ruta}`);
        expect(adjunto.url.startsWith('http')).toBe(false);
    });

    it('con COMMS_PUBLIC_BASE_URL la url es absoluta y la ruta sigue relativa', () => {
        const absoluto = new CommsStorageService(configCon('https://api.ejemplo.com/'));
        const enlace = absoluto.enlaceArchivo('3/10/comms/9/a.txt', 60, 'text/plain');
        expect(enlace.ruta).toMatch(/^public\/comms\/files\//);
        expect(enlace.url).toBe(`https://api.ejemplo.com/api/v2/${enlace.ruta}`);
        const portada = presentarPortada(absoluto, '3/10/comms/9/portada/foto.png', 60);
        expect(portada.portadaUrl?.startsWith('https://api.ejemplo.com/api/v2/')).toBe(true);
        expect(portada.portadaRuta?.startsWith('public/comms/files/')).toBe(true);
    });

    it('advierte al arrancar si COMMS_PUBLIC_BASE_URL está vacía', () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        storage.onModuleInit();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('COMMS_PUBLIC_BASE_URL'));
        warn.mockClear();
        new CommsStorageService(configCon('https://api.ejemplo.com')).onModuleInit();
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});

function configCon(base: string): ConfigService {
    return {
        get: (clave: string) => {
            if (clave === 'COMMS_PUBLIC_BASE_URL') return base;
            if (clave === 'JWT_SECRET') return 'secreto-prueba';
            return undefined;
        },
    } as ConfigService;
}
