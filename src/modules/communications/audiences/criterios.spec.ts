import { ContextoAlcance } from '../capabilities/alcance';
import { CriteriosAudiencia, EmpleadoAudiencia, evaluarCriterios } from './criterios';

function persona(parcial: Partial<EmpleadoAudiencia> & Pick<EmpleadoAudiencia, 'idEmpleado'>): EmpleadoAudiencia {
    return {
        idTenant: 1,
        idEmpresa: 10,
        idSite: 1,
        idUnidadOperativa: 100,
        idArea: null,
        idPuesto: null,
        etiquetas: [],
        idTipoPersonal: null,
        idCampania: null,
        idJefeInmediato: null,
        activo: true,
        ...parcial,
    };
}

function alcance(parcial: Partial<ContextoAlcance> = {}): ContextoAlcance {
    return {
        idTenant: 1,
        companyId: 10,
        idEmpleado: 1,
        alcance: 'TENANT',
        referencias: null,
        sitesUsuario: [],
        unidadPorSite: new Map(),
        ...parcial,
    };
}

const plantilla: EmpleadoAudiencia[] = [
    persona({ idEmpleado: 1, idEmpresa: 10, idSite: 1, idPuesto: 5, idArea: 3, etiquetas: [8], idTipoPersonal: 2, idCampania: 4 }),
    persona({ idEmpleado: 2, idEmpresa: 10, idSite: 1, idPuesto: 6, idArea: 3, idJefeInmediato: 1, idTipoPersonal: 2 }),
    persona({ idEmpleado: 3, idEmpresa: 10, idSite: 2, idUnidadOperativa: 200, idPuesto: 5, idArea: 9, idJefeInmediato: 2, etiquetas: [9] }),
    persona({ idEmpleado: 4, idEmpresa: 20, idSite: 3, idUnidadOperativa: 300, idPuesto: 5, idJefeInmediato: 1 }),
    persona({ idEmpleado: 5, idEmpresa: 10, idSite: 1, idPuesto: 5, activo: false }),
    persona({ idEmpleado: 6, idTenant: 9, idEmpresa: 10, idSite: 1, idPuesto: 5 }),
];

describe('combinación de audiencia', () => {
    it('OR dentro de la lista y AND entre listas', () => {
        const criterios: CriteriosAudiencia = { empresas: [10, 20], puestos: [5] };
        expect(evaluarCriterios(plantilla, criterios, alcance()).ids).toEqual([1, 3, 4]);
    });

    it('una lista vacía no restringe', () => {
        expect(evaluarCriterios(plantilla, { empresas: [], puestos: [6] }, alcance()).ids).toEqual([2]);
    });

    it('sin listas devuelve a todos los activos del alcance', () => {
        expect(evaluarCriterios(plantilla, {}, alcance()).ids).toEqual([1, 2, 3, 4]);
    });

    it('solo agregarEmpleados devuelve exactamente esas personas', () => {
        expect(evaluarCriterios(plantilla, { agregarEmpleados: [1, 4] }, alcance()).ids).toEqual([1, 4]);
    });

    it('solo personas resta excluir y no mete al resto de la empresa', () => {
        expect(evaluarCriterios(plantilla, { agregarEmpleados: [1, 2, 4], excluir: [2] }, alcance()).ids).toEqual([1, 4]);
    });

    it('filtros más agregarEmpleados es la unión', () => {
        expect(evaluarCriterios(plantilla, { puestos: [6], agregarEmpleados: [4] }, alcance()).ids).toEqual([2, 4]);
    });

    it('excluye después del filtro y agregar vuelve a sumar, aunque estuviera excluido', () => {
        const criterios: CriteriosAudiencia = { puestos: [5], excluir: [1, 3], agregarEmpleados: [1, 2] };
        expect(evaluarCriterios(plantilla, criterios, alcance()).ids).toEqual([1, 2, 4]);
    });

    it('agregar no mete a quien está fuera del alcance, y lo reporta', () => {
        const resultado = evaluarCriterios(plantilla, { agregarEmpleados: [2, 5, 6, 99] }, alcance({ alcance: 'EQUIPO_DIRECTO' }));
        expect(resultado.ids).toEqual([2]);
        expect(resultado.fueraDeAlcance).toEqual([5, 6, 99]);
    });

    it('el alcance de ubicaciones recorta la lista y marca el sitio que no es suyo', () => {
        const resultado = evaluarCriterios(
            plantilla,
            { ubicaciones: [1, 2] },
            alcance({ alcance: 'UBICACIONES', sitesUsuario: [1] }),
        );
        expect(resultado.ids).toEqual([1, 2]);
        expect(resultado.fueraDeAlcance).toEqual([2]);
    });

    it('empresas del alcance rechazan una empresa que no está en las referencias', () => {
        const resultado = evaluarCriterios(
            plantilla,
            { empresas: [10, 20] },
            alcance({ alcance: 'EMPRESAS', referencias: [10] }),
        );
        expect(resultado.ids).toEqual([1, 2, 3]);
        expect(resultado.fueraDeAlcance).toEqual([20]);
    });

    it('unidades: OR de unidades y fuera si la unidad no está en el alcance', () => {
        const resultado = evaluarCriterios(
            plantilla,
            { unidades: [100, 999] },
            alcance({ alcance: 'UNIDADES', referencias: [100, 200] }),
        );
        expect(resultado.ids).toEqual([1, 2]);
        expect(resultado.fueraDeAlcance).toEqual([999]);
    });

    it('etiqueta, área, tipo de personal y campaña se cruzan', () => {
        expect(
            evaluarCriterios(
                plantilla,
                { etiquetas: [8, 9], areas: [3], tiposPersonal: [2], campanas: [4] },
                alcance(),
            ).ids,
        ).toEqual([1]);
    });

    it('jefe directo no se incluye a sí mismo; estructura sí baja un nivel más', () => {
        expect(evaluarCriterios(plantilla, { jefes: [{ idEmpleado: 1, alcance: 'DIRECTO' }] }, alcance()).ids).toEqual([
            2, 4,
        ]);
        expect(evaluarCriterios(plantilla, { jefes: [{ idEmpleado: 1, alcance: 'ESTRUCTURA' }] }, alcance()).ids).toEqual([
            2, 3, 4,
        ]);
    });

    it('dos jefes se unen con OR y un jefe de otra empresa queda fuera', () => {
        const resultado = evaluarCriterios(
            plantilla,
            {
                jefes: [
                    { idEmpleado: 2, alcance: 'DIRECTO' },
                    { idEmpleado: 1, alcance: 'DIRECTO' },
                    { idEmpleado: 80, alcance: 'DIRECTO' },
                ],
            },
            alcance({ alcance: 'EMPRESAS', referencias: [10] }),
        );
        expect(resultado.ids).toEqual([2, 3]);
        expect(resultado.fueraDeAlcance).toEqual([80]);
    });

    it('la estructura del jefe se cruza con la ubicación', () => {
        expect(
            evaluarCriterios(
                plantilla,
                { jefes: [{ idEmpleado: 1, alcance: 'ESTRUCTURA' }], ubicaciones: [2] },
                alcance(),
            ).ids,
        ).toEqual([3]);
    });

    it('no toma inactivos ni empleados de otro tenant', () => {
        expect(evaluarCriterios(plantilla, { puestos: [5] }, alcance()).ids).not.toEqual(expect.arrayContaining([5, 6]));
    });

    it('el equipo directo del publicador ignora al resto de la empresa', () => {
        expect(evaluarCriterios(plantilla, { puestos: [5, 6] }, alcance({ alcance: 'EQUIPO_DIRECTO' })).ids).toEqual([2]);
    });
});

const correrLento = process.env.RUN_SLOW_TESTS === '1';

(correrLento ? describe : describe.skip)('rendimiento @slow', () => {
    it('resuelve 5000 empleados en menos de 1.5 s', () => {
        const empleados: EmpleadoAudiencia[] = [];
        for (let id = 1; id <= 5000; id += 1) {
            empleados.push(
                persona({
                    idEmpleado: id,
                    idSite: id % 2 === 0 ? 1 : 2,
                    idPuesto: id % 3 === 0 ? 5 : 6,
                    idJefeInmediato: id === 1 ? null : 1,
                }),
            );
        }
        const inicio = Date.now();
        const resultado = evaluarCriterios(
            empleados,
            { ubicaciones: [1], puestos: [5, 6], excluir: [2], agregarEmpleados: [3] },
            alcance(),
        );
        const tardanza = Date.now() - inicio;
        expect(resultado.ids.length).toBeGreaterThan(1000);
        expect(tardanza).toBeLessThan(1500);
    });
});
