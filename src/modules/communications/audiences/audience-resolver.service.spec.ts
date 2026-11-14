jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ContextoAlcance } from '../capabilities/alcance';
import { AudienceResolverService, textoSql } from './audience-resolver.service';

function alcance(parcial: Partial<ContextoAlcance> = {}): ContextoAlcance {
    return {
        idTenant: 1,
        companyId: 10,
        idEmpleado: 9,
        alcance: 'UBICACIONES',
        referencias: null,
        sitesUsuario: [1],
        unidadPorSite: new Map(),
        ...parcial,
    };
}

describe('AudienceResolverService', () => {
    let service: AudienceResolverService;
    const queryRaw = jest.fn();
    const prisma = {
        $queryRaw: queryRaw,
        catEmpresas: { findMany: jest.fn() },
        catUnidadesOperativas: { findMany: jest.fn() },
        catSites: { findMany: jest.fn() },
        catAreas: { findMany: jest.fn() },
        catPuestos: { findMany: jest.fn() },
        catEtiquetasPuesto: { findMany: jest.fn() },
        catTiposPersonal: { findMany: jest.fn() },
        catCampa_a: { findMany: jest.fn() },
        empleados: { findMany: jest.fn() },
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.catSites.findMany.mockResolvedValue([{ idSite: 1 }]);
        prisma.catPuestos.findMany.mockResolvedValue([{ idPuesto: 5 }]);
        prisma.empleados.findMany.mockResolvedValue([{ idEmpleado: 1 }]);
        queryRaw.mockResolvedValue([{ idEmpleado: 3 }]);
        const module: TestingModule = await Test.createTestingModule({
            providers: [AudienceResolverService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get(AudienceResolverService);
    });

    it('arma OR/AND, excluye, agrega y marca lo que el alcance no cubre', async () => {
        const resultado = await service.resolve(
            { ubicaciones: [1, 2], puestos: [5], excluir: [4], agregarEmpleados: [8] },
            alcance(),
        );

        expect(resultado.ids).toEqual([3]);
        expect(resultado.fueraDeAlcance).toEqual([2, 8]);
        const sql = textoSql(queryRaw.mock.calls[0][0]);
        expect(sql).toContain('idSite IN');
        expect(sql).toContain('idPuesto IN');
        expect(sql).toContain('AND');
        expect(sql).toContain('NOT IN');
        expect(sql).toContain('UNION');
        expect(sql).not.toContain('WITH RECURSIVE');
    });

    it('el jefe de estructura reutiliza el CTE y el directo no', async () => {
        await service.resolve(
            { jefes: [{ idEmpleado: 1, alcance: 'ESTRUCTURA' }] },
            alcance({ alcance: 'ESTRUCTURA', sitesUsuario: [] }),
        );
        const estructura = textoSql(queryRaw.mock.calls[0][0]);
        expect(estructura).toContain('WITH RECURSIVE');
        expect(estructura).toContain('alcance_arbol');
        expect(estructura).toContain('jefes_arbol');
        expect(estructura).toContain('nivel <');

        queryRaw.mockClear();
        await service.resolve(
            { jefes: [{ idEmpleado: 1, alcance: 'DIRECTO' }] },
            alcance({ alcance: 'EQUIPO_DIRECTO', sitesUsuario: [] }),
        );
        const directo = textoSql(queryRaw.mock.calls[0][0]);
        expect(directo).toContain('idJefeInmediato IN');
        expect(directo).not.toContain('jefes_arbol');
    });
});
