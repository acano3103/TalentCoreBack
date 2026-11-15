import { HttpException } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { REGLAS_DEFAULT } from './reglas-default';
import { ReminderRulesService } from './reminder-rules.service';

const usuario = {
    id: 4,
    uuid: 'user-4',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

function fila(codigo: string, extra: Record<string, unknown> = {}) {
    const base = REGLAS_DEFAULT.find((regla) => regla.codigo === codigo)!;
    return {
        idRegla: 100,
        idTenant: 3,
        idEmpresa: 10,
        Codigo: codigo,
        Activo: true,
        Parametros: base.parametros,
        Canales: base.canales,
        Plantilla: base.plantilla,
        AplicaTiposPersonal: null,
        ExcluyeSites: null,
        ...extra,
    };
}

describe('ReminderRulesService', () => {
    const findMany = jest.fn();
    const createMany = jest.fn();
    const findUnique = jest.fn();
    const update = jest.fn();
    const count = jest.fn();
    const enviados = jest.fn();
    const historico = jest.fn();
    const tx = {
        comReglasRecordatorio: { findUnique, update },
        historicoMovimientos: { create: historico },
    };
    const prisma = {
        comReglasRecordatorio: { findMany, createMany, update },
        comRecordatoriosEnviados: { count, findMany: enviados },
        $transaction: jest.fn(async (fn: (cliente: typeof tx) => unknown) => fn(tx)),
    };
    const capabilities = { contexto: jest.fn().mockResolvedValue({ alcance: 'EMPRESA' }) };
    const service = new ReminderRulesService(prisma as never, capabilities as never);

    beforeEach(() => {
        jest.clearAllMocks();
        capabilities.contexto.mockResolvedValue({ alcance: 'EMPRESA' });
        createMany.mockResolvedValue({ count: 11 });
        historico.mockResolvedValue({});
    });

    it('crea los defaults de la empresa cuando todavía no hay reglas', async () => {
        findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(REGLAS_DEFAULT.map((regla) => fila(regla.codigo)));
        const respuesta = await service.listar(usuario, 10);
        expect(createMany).toHaveBeenCalled();
        expect(respuesta.reglas.map((regla) => regla.codigo)).toEqual(REGLAS_DEFAULT.map((regla) => regla.codigo));
    });

    it('rechaza parámetros que no corresponden a la regla', async () => {
        findMany.mockResolvedValue([fila('R1')]);
        await expect(service.actualizar(usuario, 10, 'R1', { parametros: { minutosAntes: 0 } })).rejects.toBeInstanceOf(HttpException);
        try {
            await service.actualizar(usuario, 10, 'R1', { parametros: { minutosAntes: 0 } });
        } catch (error) {
            expect((error as HttpException).getResponse()).toMatchObject({ code: 'CONTENIDO_INVALIDO' });
        }
    });

    it('actualiza la regla y deja bitácora', async () => {
        findMany.mockResolvedValue([fila('R1')]);
        findUnique.mockResolvedValue(fila('R1'));
        update.mockResolvedValue(fila('R1', { Activo: false }));
        const respuesta = await service.actualizar(usuario, 10, 'r1', { activo: false });
        expect(respuesta.activo).toBe(false);
        expect(historico).toHaveBeenCalled();
    });

    it('restablece la plantilla y los parámetros de fábrica', async () => {
        findMany.mockResolvedValue([fila('R2', { Plantilla: 'otra' })]);
        update.mockResolvedValue(fila('R2'));
        const respuesta = await service.restablecer(usuario, 10, 'R2');
        expect(respuesta.plantilla).toContain('{hora_entrada}');
        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            where: { idEmpresa_Codigo: { idEmpresa: 10, Codigo: 'R2' } },
        }));
    });

    it('lista el historial con el id en texto', async () => {
        count.mockResolvedValue(1);
        enviados.mockResolvedValue([{
            id: 15n,
            Codigo: 'R1',
            idEmpleado: 7,
            Referencia: '2026-11-16:540',
            Intento: 1,
            EnviadoEn: new Date('2026-11-16T14:50:00.000Z'),
        }]);
        const respuesta = await service.historial(usuario, 10, { page: 1 });
        expect(respuesta.total).toBe(1);
        expect(respuesta.historial[0].id).toBe('15');
    });
});
