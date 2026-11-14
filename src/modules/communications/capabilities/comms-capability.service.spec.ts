jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { HttpException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CommsCapabilityService } from './comms-capability.service';
import { ReemplazarCapacidadesDto } from './dto/reemplazar-capacidades.dto';
import { PROFUNDIDAD_ESTRUCTURA } from './alcance';

const usuario = {
    id: 7,
    uuid: 'user-uuid',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

function sqlDe(call: unknown[]): string {
    const strings = call[0] as TemplateStringsArray;
    return Array.from(strings).join(' ');
}

describe('CommsCapabilityService', () => {
    let service: CommsCapabilityService;
    const queryRaw = jest.fn();
    const tx = {
        relRolComCapacidad: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
            count: jest.fn(),
        },
        historicoMovimientos: { create: jest.fn() },
        relUsuarioEmpresa: { findFirst: jest.fn() },
        catEmpresas: { findFirst: jest.fn() },
    };
    const prisma = {
        $queryRaw: queryRaw,
        $transaction: jest.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
        empleados: { findMany: jest.fn(), findFirst: jest.fn() },
        catComCapacidades: { findMany: jest.fn() },
        catRoles: { findFirst: jest.fn(), findMany: jest.fn() },
        comTiposComunicado: { findMany: jest.fn() },
        catEmpresas: { findMany: jest.fn(), findFirst: jest.fn() },
        catUnidadesOperativas: { findMany: jest.fn() },
        relRolComCapacidad: { findMany: jest.fn() },
    };

    let reglas: Record<string, unknown>[] = [];
    let jefe: { ok: number }[] = [];

    beforeEach(async () => {
        jest.clearAllMocks();
        reglas = [];
        jefe = [];
        queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
            const sql = Array.from(strings).join(' ');
            if (sql.includes('RelUsuarioRol')) return reglas;
            if (sql.includes('ComConfigEmpresa')) return jefe;
            if (sql.includes('WITH RECURSIVE')) return [{ idEmpleado: 4 }, { idEmpleado: 2 }, { idEmpleado: 3 }];
            if (sql.includes('RelUsuarioSite')) return [{ idEmpleado: 2 }, { idEmpleado: 1 }];
            if (sql.includes('idUnidadOperativa')) return [{ idEmpleado: 3 }];
            return [];
        });
        tx.relUsuarioEmpresa.findFirst.mockResolvedValue({ idEmpresa: 10 });
        tx.relRolComCapacidad.deleteMany.mockResolvedValue({ count: 0 });
        tx.relRolComCapacidad.createMany.mockResolvedValue({ count: 1 });
        tx.relRolComCapacidad.count.mockResolvedValue(0);
        tx.historicoMovimientos.create.mockResolvedValue({ id: 1 });

        const module: TestingModule = await Test.createTestingModule({
            providers: [CommsCapabilityService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get(CommsCapabilityService);
    });

    it('un jefe sin rol de comunicación solo recibe AVISO_EQUIPO', async () => {
        jefe = [{ ok: 1 }];

        await expect(service.getEffective(usuario, 10)).resolves.toEqual([
            {
                codigo: 'COM_CREAR',
                alcance: 'EQUIPO_DIRECTO',
                referencias: null,
                tiposPermitidos: ['AVISO_EQUIPO'],
            },
        ]);
    });

    it('sin reportes directos no agrega el aviso de equipo', async () => {
        jefe = [];

        await expect(service.getEffective(usuario, 10)).resolves.toEqual([]);
    });

    it('resuelve tres roles en una sola consulta', async () => {
        reglas = [
            { codigo: 'COM_CREAR', alcance: 'UBICACIONES', referencias: null, tiposPermitidos: ['GENERAL'] },
            { codigo: 'COM_VER_ANALITICA', alcance: 'EMPRESAS', referencias: [10], tiposPermitidos: null },
            { codigo: 'CFG_CANALES', alcance: 'TENANT', referencias: null, tiposPermitidos: null },
        ];

        const efectivas = await service.getEffective(usuario, 10);

        expect(efectivas.map((item) => item.codigo)).toEqual(['CFG_CANALES', 'COM_CREAR', 'COM_VER_ANALITICA']);
        const consultasDeRoles = queryRaw.mock.calls.filter((call) => sqlDe(call).includes('RelUsuarioRol'));
        expect(consultasDeRoles).toHaveLength(1);
    });

    it('la ruta de roles no consulta el aviso de equipo', async () => {
        await service.getEffective(usuario, 0);

        const consultasDeJefe = queryRaw.mock.calls.filter((call) => sqlDe(call).includes('ComConfigEmpresa'));
        expect(consultasDeJefe).toHaveLength(0);
    });

    it('TENANT devuelve los empleados activos del tenant', async () => {
        reglas = [{ codigo: 'COM_CREAR', alcance: 'TENANT', referencias: null, tiposPermitidos: null }];
        prisma.empleados.findMany.mockResolvedValue([{ idEmpleado: 8 }, { idEmpleado: 2 }]);

        await expect(service.resolveScopeEmployeeIds('COM_CREAR', usuario, 10)).resolves.toEqual([2, 8]);
        expect(prisma.empleados.findMany).toHaveBeenCalledWith({
            where: { idTenant: 3, activo: true },
            select: { idEmpleado: true },
        });
    });

    it('EMPRESAS filtra por las referencias', async () => {
        reglas = [{ codigo: 'COM_CREAR', alcance: 'EMPRESAS', referencias: [20, 10], tiposPermitidos: null }];
        prisma.empleados.findMany.mockResolvedValue([{ idEmpleado: 6 }]);

        await expect(service.resolveScopeEmployeeIds('COM_CREAR', usuario, 10)).resolves.toEqual([6]);
        expect(prisma.empleados.findMany).toHaveBeenCalledWith({
            where: { idTenant: 3, activo: true, idEmpresa: { in: [10, 20] } },
            select: { idEmpleado: true },
        });
    });

    it('UNIDADES y UBICACIONES salen de la consulta de sitios', async () => {
        reglas = [{ codigo: 'COM_CREAR', alcance: 'UNIDADES', referencias: [100], tiposPermitidos: null }];
        await expect(service.resolveScopeEmployeeIds('COM_CREAR', usuario, 10)).resolves.toEqual([3]);

        reglas = [{ codigo: 'COM_CREAR', alcance: 'UBICACIONES', referencias: null, tiposPermitidos: null }];
        await expect(service.resolveScopeEmployeeIds('COM_CREAR', usuario, 10)).resolves.toEqual([1, 2]);
        const ubicaciones = queryRaw.mock.calls.find((call) => sqlDe(call).includes('RelUsuarioSite'));
        expect(ubicaciones?.slice(1)).toEqual(expect.arrayContaining([7, 10, 3]));
    });

    it('ESTRUCTURA usa el CTE con tope de profundidad y tres niveles de resultado', async () => {
        reglas = [{ codigo: 'COM_CREAR', alcance: 'ESTRUCTURA', referencias: null, tiposPermitidos: null }];
        prisma.empleados.findFirst.mockResolvedValue({ idEmpleado: 1 });

        await expect(service.resolveScopeEmployeeIds('COM_CREAR', usuario, 10)).resolves.toEqual([2, 3, 4]);

        const arbol = queryRaw.mock.calls.find((call) => sqlDe(call).includes('WITH RECURSIVE'));
        expect(arbol).toBeDefined();
        expect(sqlDe(arbol as unknown[])).toContain('WITH RECURSIVE');
        expect(arbol?.slice(1)).toContain(PROFUNDIDAD_ESTRUCTURA);
    });

    it('EQUIPO_DIRECTO pide solo los reportes del empleado', async () => {
        reglas = [{ codigo: 'COM_CREAR', alcance: 'EQUIPO_DIRECTO', referencias: null, tiposPermitidos: null }];
        prisma.empleados.findFirst.mockResolvedValue({ idEmpleado: 1 });
        prisma.empleados.findMany.mockResolvedValue([{ idEmpleado: 2 }]);

        await expect(service.resolveScopeEmployeeIds('COM_CREAR', usuario, 10)).resolves.toEqual([2]);
        expect(prisma.empleados.findMany).toHaveBeenCalledWith({
            where: { idJefeInmediato: 1, idEmpresa: 10, idTenant: 3, activo: true },
            select: { idEmpleado: true },
        });
    });

    it('sin la capacidad responde 403 con code', async () => {
        await expect(service.resolveScopeEmployeeIds('COM_CREAR', usuario, 10)).rejects.toMatchObject({
            status: 403,
            response: { code: 'SIN_CAPACIDAD' },
        });
    });

    it('rechaza referencias en un alcance que no las usa', async () => {
        prisma.catRoles.findFirst.mockResolvedValue({ idRol: 4, descripcion: 'Admin' });

        await expect(
            service.reemplazar(usuario, 4, dto([{ codigo: 'COM_CREAR', alcance: 'TENANT', referencias: [10] }])),
        ).rejects.toMatchObject({
            status: 400,
            response: { code: 'CONTENIDO_INVALIDO' },
        });
    });

    it('marca las empresas ajenas como fuera de alcance', async () => {
        prisma.catRoles.findFirst.mockResolvedValue({ idRol: 4, descripcion: 'Admin' });
        prisma.catComCapacidades.findMany.mockResolvedValue([{ idCapacidad: 1, Codigo: 'COM_CREAR' }]);
        prisma.catEmpresas.findMany.mockResolvedValue([]);

        const error = await promesaFallida(
            service.reemplazar(usuario, 4, dto([{ codigo: 'COM_CREAR', alcance: 'EMPRESAS', referencias: [99] }])),
        );

        expect(error.getStatus()).toBe(403);
        expect(error.getResponse()).toMatchObject({ code: 'FUERA_DE_ALCANCE', detail: { ids: [99] } });
    });

    it('reemplaza el set del rol y lo deja en la bitácora', async () => {
        prisma.catRoles.findFirst.mockResolvedValue({ idRol: 4, descripcion: 'Admin' });
        prisma.catComCapacidades.findMany.mockResolvedValue([{ idCapacidad: 1, Codigo: 'COM_CREAR' }]);
        prisma.relRolComCapacidad.findMany.mockResolvedValue([
            {
                Alcance: 'TENANT',
                Referencias: null,
                TiposPermitidos: null,
                RequiereAprobacion: false,
                CatComCapacidades: { Codigo: 'COM_CREAR', Descripcion: 'Crear y enviar comunicados' },
            },
        ]);

        const resultado = await service.reemplazar(usuario, 4, dto([{ codigo: 'COM_CREAR', alcance: 'TENANT' }]));

        expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
            maxWait: 15_000,
            timeout: 20_000,
        });
        expect(tx.relRolComCapacidad.deleteMany).toHaveBeenCalledWith({
            where: { idRol: 4, idTenant: 3 },
        });
        expect(tx.relRolComCapacidad.createMany).toHaveBeenCalledWith({
            data: [
                {
                    idTenant: 3,
                    idRol: 4,
                    idCapacidad: 1,
                    Alcance: 'TENANT',
                    Referencias: Prisma.JsonNull,
                    TiposPermitidos: Prisma.JsonNull,
                    RequiereAprobacion: false,
                },
            ],
        });
        expect(tx.historicoMovimientos.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                idUsuario: 7,
                idEmpresa: 10,
                accion: 'ACTUALIZAR',
                tablaOrigen: 'RelRolComCapacidad',
                idRegistro: '4',
            }),
        });
        expect(resultado.capacidades[0].codigo).toBe('COM_CREAR');
    });

    it('no aplica la plantilla si el tenant ya tiene capacidades', async () => {
        prisma.catComCapacidades.findMany.mockResolvedValue(
            ['COM_CREAR', 'COM_AVISO_OPERATIVO', 'COM_CRITICO', 'COM_VER_ANALITICA', 'AUD_GESTIONAR', 'CFG_RECORDATORIOS', 'CFG_CANALES', 'CFG_PERMISOS'].map(
                (Codigo, indice) => ({ idCapacidad: indice + 1, Codigo }),
            ),
        );
        prisma.catRoles.findMany.mockResolvedValue([
            { idRol: 4, descripcion: 'Admin' },
            { idRol: 5, descripcion: 'RH' },
        ]);
        tx.relRolComCapacidad.count.mockResolvedValue(2);

        await expect(service.aplicarPlantilla(usuario)).rejects.toMatchObject({
            status: 409,
            response: { code: 'ESTADO_INVALIDO' },
        });
        expect(tx.relRolComCapacidad.createMany).not.toHaveBeenCalled();
    });

    it('la plantilla da CFG_PERMISOS solo a Admin', async () => {
        prisma.catComCapacidades.findMany.mockResolvedValue(
            ['COM_CREAR', 'COM_AVISO_OPERATIVO', 'COM_CRITICO', 'COM_VER_ANALITICA', 'AUD_GESTIONAR', 'CFG_RECORDATORIOS', 'CFG_CANALES', 'CFG_PERMISOS'].map(
                (Codigo, indice) => ({ idCapacidad: indice + 1, Codigo }),
            ),
        );
        prisma.catRoles.findMany.mockResolvedValue([
            { idRol: 4, descripcion: 'Admin' },
            { idRol: 5, descripcion: 'RH' },
        ]);

        const resultado = await service.aplicarPlantilla(usuario);

        expect(resultado).toEqual({ roles: ['Admin', 'RH'], asignaciones: 15 });
        const data = tx.relRolComCapacidad.createMany.mock.calls[0][0].data as { idRol: number; idCapacidad: number }[];
        const deRh = data.filter((fila) => fila.idRol === 5).map((fila) => fila.idCapacidad);
        expect(deRh).not.toContain(8);
        expect(data.filter((fila) => fila.idRol === 4).map((fila) => fila.idCapacidad)).toContain(8);
    });
});

function dto(capacidades: ReemplazarCapacidadesDto['capacidades']): ReemplazarCapacidadesDto {
    return { capacidades };
}

async function promesaFallida(promesa: Promise<unknown>): Promise<HttpException> {
    try {
        await promesa;
    } catch (error) {
        return error as HttpException;
    }
    throw new Error('Se esperaba un error.');
}
