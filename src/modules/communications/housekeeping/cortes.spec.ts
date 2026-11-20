import { alcanceParaIncluirNuevos, hechoEmpleadoValido, restarDias } from './cortes';

describe('cortes de mantenimiento', () => {
    const ahora = new Date('2026-11-14T08:00:00.000Z');

    it('resta días completos', () => {
        expect(restarDias(ahora, 90).toISOString()).toBe('2026-08-16T08:00:00.000Z');
        expect(restarDias(ahora, 365).toISOString()).toBe('2025-11-14T08:00:00.000Z');
    });

    it('acepta alta, movimiento y baja con ids enteros', () => {
        expect(hechoEmpleadoValido({ tipo: 'ALTA', idTenant: 3, idEmpresa: 10, idEmpleado: 42 })).toBe(true);
        expect(hechoEmpleadoValido({ tipo: 'MOVIMIENTO', idTenant: 3, idEmpresa: 10, idEmpleado: 42 })).toBe(true);
        expect(hechoEmpleadoValido({ tipo: 'BAJA', idTenant: 1, idEmpresa: 1, idEmpleado: 1 })).toBe(true);
    });

    it('rechaza un hecho incompleto', () => {
        expect(hechoEmpleadoValido(null)).toBe(false);
        expect(hechoEmpleadoValido({ tipo: 'ALTA', idTenant: 3, idEmpresa: 10, idEmpleado: 0 })).toBe(false);
        expect(hechoEmpleadoValido({ tipo: 'OTRO' as 'ALTA', idTenant: 3, idEmpresa: 10, idEmpleado: 4 })).toBe(false);
    });

    it('si los criterios no nombran empresas, se queda en la empresa del comunicado', () => {
        const alcance = alcanceParaIncluirNuevos(3, 10, { ubicaciones: [4] });
        expect(alcance).toMatchObject({ alcance: 'EMPRESAS', companyId: 10, referencias: [10], idTenant: 3 });
    });

    it('si los criterios nombran empresas, usa esa lista', () => {
        const alcance = alcanceParaIncluirNuevos(3, 10, { empresas: [10, 11] });
        expect(alcance.referencias).toEqual([10, 11]);
    });
});
