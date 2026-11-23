jest.mock('fs-extra', () => ({
    pathExists: jest.fn(),
}));

import * as fs from 'fs-extra';
import * as path from 'path';
import { CourseMaterialsService } from './course-materials.service';

const ARCHIVO = '3f1a2b4c-5d6e-7f80-9a1b-2c3d4e5f6071.pdf';

describe('CourseMaterialsService empleado', () => {
    const carpeta = path.resolve(process.cwd(), 'tmp-materiales-spec');
    const learning = { getParticipation: jest.fn().mockResolvedValue({ idTenant: 4 }) };
    const prisma = {
        cursoLecciones: {
            findMany: jest.fn().mockResolvedValue([
                { materiales: [{ archivo: ARCHIVO, nombre: 'Guía de inducción.pdf', tipo: 'archivo' }] },
            ]),
        },
    };
    const media = { getTenantPath: jest.fn().mockResolvedValue(carpeta) };
    const service = new CourseMaterialsService(prisma as any, media as any, {} as any, learning as any);
    const user = { id: 1, idTenant: 4 } as any;

    beforeEach(() => {
        (fs.pathExists as unknown as jest.Mock).mockResolvedValue(true);
    });

    function respuesta() {
        return {
            headersSent: false,
            sendFile: jest.fn((_archivo: string, _opciones: { headers: Record<string, string | undefined> }, callback: (error?: Error) => void) => callback()),
        };
    }

    it('la web sigue enviando el archivo sin Content-Disposition', async () => {
        const res = respuesta();
        await service.sendForEmployee(7, 3, ARCHIVO, user, res as any);
        const headers = res.sendFile.mock.calls[0][1].headers;
        expect(headers['Cache-Control']).toBe('private, max-age=300');
        expect(headers['Content-Disposition']).toBeUndefined();
        expect(headers['Content-Type']).toBeUndefined();
    });

    it('la app manda Content-Type y filename* UTF-8', async () => {
        const res = respuesta();
        await service.sendForMobileEmployee(7, 3, ARCHIVO, user, res as any);
        const headers = res.sendFile.mock.calls[0][1].headers;
        expect(headers['Content-Type']).toBe('application/pdf');
        expect(headers['Cache-Control']).toBe('private, max-age=300');
        expect(headers['Content-Disposition']).toBe(
            `inline; filename*=UTF-8''${encodeURIComponent('Guía de inducción.pdf')}`,
        );
    });
});
