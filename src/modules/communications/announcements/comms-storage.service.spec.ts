import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
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
});
