import { ContextoAlcance } from '../capabilities/alcance';
import { textoSql } from './audience-resolver.service';
import { consultaAudiencia, consultaEmpleadoEnCriterios } from './alcance-sql';

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

    it('solo agregarEmpleados no parte de toda la empresa', () => {
        const sql = textoSql(consultaAudiencia({ agregarEmpleados: [1, 4], excluir: [4] }, scope));
        expect(sql.replace(/\s/g, '')).toContain('e.idEmpleadoIN(1,4)');
        expect(sql.replace(/\s/g, '')).toContain('NOTIN(4)');
        expect(sql).not.toContain('UNION');
    });

    it('criterios vacíos no restringen a una lista de personas', () => {
        const sql = textoSql(consultaAudiencia({}, scope));
        expect(sql).not.toContain('e.idEmpleado IN');
        expect(sql).not.toContain('UNION');
    });

    it('un filtro más agregarEmpleados sigue siendo la unión', () => {
        const sql = textoSql(consultaAudiencia({ puestos: [6], agregarEmpleados: [4] }, scope));
        expect(sql).toContain('UNION');
        expect(sql).toContain('e.idPuesto IN (6)');
        expect(sql).toContain('e.idEmpleado IN (4)');
    });
});
