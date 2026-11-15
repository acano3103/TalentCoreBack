import { ContextoAlcance } from '../capabilities/alcance';
import { textoSql } from './audience-resolver.service';
import { consultaEmpleadoEnCriterios } from './alcance-sql';

const scope: ContextoAlcance = {
    idTenant: 3,
    companyId: 10,
    idEmpleado: null,
    alcance: 'EMPRESAS',
    referencias: [10],
    sitesUsuario: [],
    unidadPorSite: new Map(),
};

describe('consultaEmpleadoEnCriterios', () => {
    it('acota la consulta al empleado y a la empresa del alcance', () => {
        const sql = textoSql(consultaEmpleadoEnCriterios(42, { ubicaciones: [4] }, scope));
        expect(sql).toContain('e.idEmpleado = 42');
        expect(sql).toContain('e.idSite IN (4)');
        expect(sql).toContain('e.idEmpresa IN (10)');
        expect(sql).toContain('e.activo = 1');
    });
});
