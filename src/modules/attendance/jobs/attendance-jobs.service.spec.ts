jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { AttendanceEngineService } from '../engine/attendance-engine.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AttendanceJobsService } from './attendance-jobs.service';

describe('AttendanceJobsService purga de evidencias', () => {
    const mediaRoot = resolve(process.cwd(), 'tmp-media-root-test');
    let service: AttendanceJobsService;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        const config = {
            get: jest.fn((key: string) => (key === 'MEDIA_ROOT_PATH' ? mediaRoot : undefined)),
        };
        service = new AttendanceJobsService(
            {} as PrismaService,
            {} as AttendanceEngineService,
            config as unknown as ConfigService,
        );
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
    });

    function resolver(ruta: string): string {
        return (service as unknown as { resolverRutaEvidencia(ruta: string): string }).resolverRutaEvidencia(ruta);
    }

    it('resuelve /media/<slug>/... dentro de MEDIA_ROOT_PATH', () => {
        expect(resolver('/media/acme/attendance/1/2026/11/a.jpg')).toBe(
            resolve(mediaRoot, 'acme/attendance/1/2026/11/a.jpg'),
        );
        expect(warn).not.toHaveBeenCalled();
    });

    it('rechaza una ruta que sale de la carpeta de medios', () => {
        expect(() => resolver('/media/../x')).toThrow(/MEDIA_ROOT_PATH/);
    });

    it('conserva la ruta legacy media/ del repositorio y deja un aviso', () => {
        expect(resolver('media/attendance/1/2026/11/a.jpg')).toBe(
            resolve(process.cwd(), 'media/attendance/1/2026/11/a.jpg'),
        );
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('ruta legacy'));
    });
});
