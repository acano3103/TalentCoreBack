import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { dispositionInline, nombreDeDescarga } from './archivo-publico';
import { CommsFilesController } from './comms-files.controller';
import { CommsStorageService } from './comms-storage.service';

describe('CommsFilesController', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'comms-files-'));
    const config = {
        get: (clave: string) => {
            if (clave === 'COMMS_MEDIA_BASE_PATH') return raiz;
            if (clave === 'JWT_SECRET') return 'secreto-prueba';
            if (clave === 'COMMS_PUBLIC_BASE_URL') return '';
            return undefined;
        },
    } as ConfigService;
    const storage = new CommsStorageService(config);
    const prisma = { comComunicadoAdjuntos: { findFirst: jest.fn() } };
    const controller = new CommsFilesController(storage, prisma as unknown as PrismaService);

    afterAll(() => rmSync(raiz, { recursive: true, force: true }));

    it('descarga con el nombre visible y acentos, no con el del disco', async () => {
        const visible = 'Estructura por Módulos de Implementación.pdf';
        const ruta = await storage.put(Buffer.from('%PDF-1.4 hola'), {
            tenant: 3,
            empresa: 1,
            carpeta: '6/adjuntos',
            nombre: 'uuid-Estructura_por_M__dulos.pdf',
            mime: 'application/pdf',
        });
        prisma.comComunicadoAdjuntos.findFirst.mockResolvedValue({ Nombre: visible });
        const firma = storage.enlaceArchivo(ruta, 60, 'application/pdf').ruta.split('/').pop() ?? '';
        const archivo = await controller.abrir(firma);
        expect(archivo.getHeaders().disposition).toBe(
            `inline; filename*=UTF-8''${encodeURIComponent(visible)}`,
        );
        expect(archivo.getHeaders().disposition).not.toContain('uuid-');
        expect(archivo.getHeaders().type).toBe('application/pdf');
    });

    it('codifica Año en el encabezado y repara un nombre ya guardado mal', () => {
        expect(dispositionInline('Año.pdf')).toBe(`inline; filename*=UTF-8''${encodeURIComponent('Año.pdf')}`);
        const mal = Buffer.from('Módulos.pdf', 'utf8').toString('latin1');
        expect(nombreDeDescarga('archivo.pdf', mal)).toBe('Módulos.pdf');
    });

    it('si no hay nombre visible usa el archivo sin el uuid', async () => {
        const ruta = await storage.put(Buffer.from('%PDF-1.4'), {
            tenant: 3,
            empresa: 1,
            carpeta: '6/portada',
            nombre: '79f4a232-85ce-46b1-bace-4981d425d61d-Talent_Core.png',
            mime: 'image/png',
        });
        prisma.comComunicadoAdjuntos.findFirst.mockResolvedValue(null);
        const firma = storage.enlaceArchivo(ruta, 60, 'image/png').ruta.split('/').pop() ?? '';
        const archivo = await controller.abrir(firma);
        expect(archivo.getHeaders().disposition).toBe(`inline; filename*=UTF-8''Talent_Core.png`);
    });
});
