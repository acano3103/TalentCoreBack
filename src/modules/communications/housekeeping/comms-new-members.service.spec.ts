import { CommsNewMembersService } from './comms-new-members.service';

describe('CommsNewMembersService', () => {
    const ahora = new Date('2026-11-14T08:00:00.000Z');
    const alta = { tipo: 'ALTA' as const, idTenant: 3, idEmpresa: 10, idEmpleado: 42 };

    function armar() {
        const prisma = {
            comComunicados: {
                findMany: jest.fn().mockResolvedValue([
                    { idComunicado: 9, idEmpresa: 10, CriteriosAudiencia: { ubicaciones: [4] } },
                    { idComunicado: 8, idEmpresa: 10, CriteriosAudiencia: { ubicaciones: [9] } },
                ]),
            },
            comDestinatarios: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
            empleados: { findUnique: jest.fn().mockResolvedValue({ idUsuario: 'user-1' }) },
            pushTokens: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
            comAcuses: { deleteMany: jest.fn(), updateMany: jest.fn() },
        };
        const resolver = { coincideConCriterios: jest.fn().mockImplementation(async (_id: number, criterios: { ubicaciones?: number[] }) => criterios.ubicaciones?.includes(4) ?? false) };
        const dispatch = { incorporarEmpleado: jest.fn().mockResolvedValue(true) };
        const service = new CommsNewMembersService(prisma as never, resolver as never, dispatch as never);
        service.ahora = () => ahora;
        return { service, prisma, resolver, dispatch };
    }

    it('crea destinatario solo en los comunicados vigentes cuya audiencia lo incluye', async () => {
        const { service, prisma, dispatch } = armar();
        await service.onEmpleado(alta);
        expect(prisma.comComunicados.findMany).toHaveBeenCalledWith({
            where: {
                idTenant: 3,
                IncluirNuevos: true,
                Estado: 'ENVIADO',
                OR: [{ VigenteHasta: null }, { VigenteHasta: { gt: ahora } }],
            },
            select: { idComunicado: true, idEmpresa: true, CriteriosAudiencia: true },
        });
        expect(dispatch.incorporarEmpleado).toHaveBeenCalledTimes(1);
        expect(dispatch.incorporarEmpleado).toHaveBeenCalledWith(9, 42);
    });

    it('un movimiento usa la misma incorporación', async () => {
        const { service, dispatch } = armar();
        await service.onEmpleado({ ...alta, tipo: 'MOVIMIENTO' });
        expect(dispatch.incorporarEmpleado).toHaveBeenCalledWith(9, 42);
    });

    it('la baja expira lo pendiente y apaga los tokens, sin borrar acuses', async () => {
        const { service, prisma, dispatch } = armar();
        await service.onEmpleado({ ...alta, tipo: 'BAJA' });
        expect(dispatch.incorporarEmpleado).not.toHaveBeenCalled();
        expect(prisma.comDestinatarios.updateMany).toHaveBeenCalledWith({
            where: {
                idEmpleado: 42,
                Estado: { in: ['PENDIENTE', 'ENTREGADO', 'LEIDO', 'FALLIDO', 'SIN_CANAL'] },
            },
            data: { Estado: 'EXPIRADO' },
        });
        expect(prisma.pushTokens.updateMany).toHaveBeenCalledWith({
            where: { Activo: true, OR: [{ idEmpleado: 42 }, { user_uuid: 'user-1' }] },
            data: { Activo: false, FechaBaja: ahora, MotivoBaja: 'BAJA_EMPLEADO' },
        });
        expect(prisma.comAcuses.deleteMany).not.toHaveBeenCalled();
        expect(prisma.comAcuses.updateMany).not.toHaveBeenCalled();
    });

    it('ignora un hecho inválido', async () => {
        const { service, prisma, dispatch } = armar();
        await service.onEmpleado({ ...alta, idEmpleado: 0 });
        expect(prisma.comComunicados.findMany).not.toHaveBeenCalled();
        expect(dispatch.incorporarEmpleado).not.toHaveBeenCalled();
    });
});
