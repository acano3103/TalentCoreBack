jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { EffectiveChannelService } from './effective-channel.service';

describe('EffectiveChannelService', () => {
    let service: EffectiveChannelService;
    const queryRaw = jest.fn();
    const prisma = {
        $queryRaw: queryRaw,
        comPerfilesCanal: { findMany: jest.fn() },
        comConfigEmpresa: { findUnique: jest.fn() },
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        queryRaw.mockResolvedValue([
            {
                idEmpleado: 7,
                idEmpresa: 10,
                idSite: 3,
                idTipoPersonal: 2,
                telefonoMovil: '5512345678',
                correo: 'ana@empresa.test',
                usuarioWebActivo: 1,
                pushActivo: 1,
                loginMovil: 0,
                kioscoActivo: 0,
            },
            {
                idEmpleado: 8,
                idEmpresa: 10,
                idSite: 3,
                idTipoPersonal: 2,
                telefonoMovil: null,
                correo: null,
                usuarioWebActivo: 0,
                pushActivo: 0,
                loginMovil: 0,
                kioscoActivo: 0,
            },
        ]);
        prisma.comPerfilesCanal.findMany.mockResolvedValue([
            { idEmpresa: 10, Nivel: 'TIPO_PERSONAL', idReferencia: 2, Canales: ['KIOSCO'] },
            { idEmpresa: 10, Nivel: 'EMPLEADO', idReferencia: 7, Canales: ['APP', 'WHATSAPP', 'WEB'] },
        ]);
        prisma.comConfigEmpresa.findUnique.mockResolvedValue({ PoliticaWhatsApp: 'NUNCA' });
        const module: TestingModule = await Test.createTestingModule({
            providers: [EffectiveChannelService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get(EffectiveChannelService);
    });

    it('respeta la precedencia del perfil y la política que apaga WhatsApp', async () => {
        const resultado = await service.forEmployees([7, 8, 9], 10);

        expect(resultado.porEmpleado).toEqual([
            { idEmpleado: 7, canales: ['APP', 'WEB'], sinCanal: false, nivelPerfil: 'EMPLEADO' },
            { idEmpleado: 8, canales: [], sinCanal: true, nivelPerfil: 'TIPO_PERSONAL' },
            { idEmpleado: 9, canales: [], sinCanal: true, nivelPerfil: 'DEFAULT' },
        ]);
        expect(resultado.resumen).toEqual({ APP: 1, WHATSAPP: 0, CORREO: 0, KIOSCO: 0, SIN_CANAL: 2 });
        const sql = JSON.stringify(queryRaw.mock.calls[0][0]);
        expect(sql).toContain('PushTokens');
    });
});
