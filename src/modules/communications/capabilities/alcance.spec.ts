import {
    ComAlcanceCodigo,
    empleadosAlcanzables,
    EmpleadoAlcance,
    expandirEstructura,
    formaAlcanceInvalida,
    fusionarReglas,
    leerIds,
    leerTipos,
    PROFUNDIDAD_ESTRUCTURA,
} from './alcance';

describe('fusión de capacidades', () => {
    it('se queda con el alcance mayor y une los tipos', () => {
        const efectivas = fusionarReglas([
            {
                codigo: 'COM_CREAR',
                alcance: 'UBICACIONES',
                referencias: null,
                tiposPermitidos: ['GENERAL'],
            },
            {
                codigo: 'COM_CREAR',
                alcance: 'TENANT',
                referencias: null,
                tiposPermitidos: ['AVISO_EQUIPO'],
            },
        ]);

        expect(efectivas).toEqual([
            {
                codigo: 'COM_CREAR',
                alcance: 'TENANT',
                referencias: null,
                tiposPermitidos: ['AVISO_EQUIPO', 'GENERAL'],
            },
        ]);
    });

    it('une las referencias cuando el alcance es el mismo', () => {
        const efectivas = fusionarReglas([
            { codigo: 'COM_CREAR', alcance: 'EMPRESAS', referencias: [20], tiposPermitidos: ['GENERAL'] },
            { codigo: 'COM_CREAR', alcance: 'EMPRESAS', referencias: [10], tiposPermitidos: ['POLITICA'] },
        ]);

        expect(efectivas[0].referencias).toEqual([10, 20]);
        expect(efectivas[0].tiposPermitidos).toEqual(['GENERAL', 'POLITICA']);
    });

    it('un tipo sin restricción deja la capacidad abierta a todos', () => {
        const efectivas = fusionarReglas([
            { codigo: 'COM_CREAR', alcance: 'TENANT', referencias: null, tiposPermitidos: null },
            {
                codigo: 'COM_CREAR',
                alcance: 'EQUIPO_DIRECTO',
                referencias: null,
                tiposPermitidos: ['AVISO_EQUIPO'],
            },
        ]);

        expect(efectivas[0].alcance).toBe('TENANT');
        expect(efectivas[0].tiposPermitidos).toBeNull();
    });

    it('el aviso de equipo no reemplaza un alcance más amplio', () => {
        const efectivas = fusionarReglas([
            { codigo: 'COM_CREAR', alcance: 'TENANT', referencias: null, tiposPermitidos: ['GENERAL'] },
            {
                codigo: 'COM_CREAR',
                alcance: 'EQUIPO_DIRECTO',
                referencias: null,
                tiposPermitidos: ['AVISO_EQUIPO'],
            },
        ]);

        expect(efectivas[0]).toEqual({
            codigo: 'COM_CREAR',
            alcance: 'TENANT',
            referencias: null,
            tiposPermitidos: ['AVISO_EQUIPO', 'GENERAL'],
        });
    });
});

describe('forma del alcance', () => {
    it('empresas y unidades exigen referencias, y el resto las rechaza', () => {
        expect(formaAlcanceInvalida('EMPRESAS', null)).toBe('faltan');
        expect(formaAlcanceInvalida('UNIDADES', [])).toBe('faltan');
        expect(formaAlcanceInvalida('EMPRESAS', [4])).toBeNull();
        expect(formaAlcanceInvalida('TENANT', [4])).toBe('sobran');
        expect(formaAlcanceInvalida('UBICACIONES', null)).toBeNull();
        expect(formaAlcanceInvalida('ESTRUCTURA', null)).toBeNull();
        expect(formaAlcanceInvalida('EQUIPO_DIRECTO', [1])).toBe('sobran');
    });
});

describe('lectura de JSON', () => {
    it('acepta lista o texto JSON y descarta ids que no son positivos', () => {
        expect(leerIds('[2, "4", 0, -1]')).toEqual([2, 4]);
        expect(leerIds(null)).toBeNull();
        expect(leerTipos('["aviso_equipo", "GENERAL"]')).toEqual(['AVISO_EQUIPO', 'GENERAL']);
        expect(leerTipos([])).toBeNull();
    });
});

const unidadPorSite = new Map<number, number | null>([
    [1, 100],
    [2, 100],
    [3, 200],
]);

const empleados: EmpleadoAlcance[] = [
    { idEmpleado: 1, idTenant: 3, idEmpresa: 10, idSite: 1, idJefeInmediato: null, activo: true },
    { idEmpleado: 2, idTenant: 3, idEmpresa: 10, idSite: 1, idJefeInmediato: 1, activo: true },
    { idEmpleado: 3, idTenant: 3, idEmpresa: 10, idSite: 2, idJefeInmediato: 2, activo: true },
    { idEmpleado: 4, idTenant: 3, idEmpresa: 10, idSite: 2, idJefeInmediato: 3, activo: true },
    { idEmpleado: 5, idTenant: 3, idEmpresa: 10, idSite: 1, idJefeInmediato: 1, activo: false },
    { idEmpleado: 6, idTenant: 3, idEmpresa: 20, idSite: 3, idJefeInmediato: 1, activo: true },
    { idEmpleado: 7, idTenant: 3, idEmpresa: 20, idSite: 3, idJefeInmediato: null, activo: true },
    { idEmpleado: 8, idTenant: 3, idEmpresa: 10, idSite: null, idJefeInmediato: null, activo: true },
    { idEmpleado: 9, idTenant: 9, idEmpresa: 10, idSite: 1, idJefeInmediato: 1, activo: true },
    { idEmpleado: 10, idTenant: 3, idEmpresa: 20, idSite: 1, idJefeInmediato: null, activo: true },
];

function alcanzables(alcance: ComAlcanceCodigo, extra: Partial<Parameters<typeof empleadosAlcanzables>[1]> = {}) {
    return empleadosAlcanzables(empleados, {
        idTenant: 3,
        companyId: 10,
        idEmpleado: 1,
        alcance,
        referencias: null,
        sitesUsuario: [1],
        unidadPorSite,
        ...extra,
    });
}

describe('resolución de alcance', () => {
    it('TENANT incluye a los activos del tenant, de cualquier empresa', () => {
        expect(alcanzables('TENANT')).toEqual([1, 2, 3, 4, 6, 7, 8, 10]);
    });

    it('EMPRESAS se queda con las empresas de las referencias', () => {
        expect(alcanzables('EMPRESAS', { referencias: [10] })).toEqual([1, 2, 3, 4, 8]);
        expect(alcanzables('EMPRESAS', { referencias: [20] })).toEqual([6, 7, 10]);
    });

    it('UNIDADES sigue el sitio hasta la unidad operativa', () => {
        expect(alcanzables('UNIDADES', { referencias: [100] })).toEqual([1, 2, 3, 4, 10]);
        expect(alcanzables('UNIDADES', { referencias: [200] })).toEqual([6, 7]);
    });

    it('UBICACIONES usa los sitios asignados al usuario dentro de la empresa', () => {
        expect(alcanzables('UBICACIONES')).toEqual([1, 2]);
    });

    it('ESTRUCTURA baja tres niveles y no sale de la empresa', () => {
        expect(alcanzables('ESTRUCTURA')).toEqual([2, 3, 4]);
    });

    it('EQUIPO_DIRECTO solo trae reportes directos activos de la empresa', () => {
        expect(alcanzables('EQUIPO_DIRECTO')).toEqual([2]);
    });

    it('sin empleado propio, la jefatura no alcanza a nadie', () => {
        expect(alcanzables('ESTRUCTURA', { idEmpleado: null })).toEqual([]);
        expect(alcanzables('EQUIPO_DIRECTO', { idEmpleado: null })).toEqual([]);
    });
});

describe('estructura recursiva', () => {
    it(`corta a ${PROFUNDIDAD_ESTRUCTURA} niveles`, () => {
        const cadena = Array.from({ length: 17 }, (_, indice) => ({
            idEmpleado: indice + 1,
            idJefeInmediato: indice === 0 ? null : indice,
        }));

        const ids = expandirEstructura(cadena, 1, PROFUNDIDAD_ESTRUCTURA);

        expect(ids).toHaveLength(PROFUNDIDAD_ESTRUCTURA);
        expect(ids[0]).toBe(2);
        expect(ids[ids.length - 1]).toBe(16);
        expect(ids).not.toContain(17);
    });

    it('un ciclo entre dos personas no se repite', () => {
        expect(
            expandirEstructura(
                [
                    { idEmpleado: 2, idJefeInmediato: 1 },
                    { idEmpleado: 1, idJefeInmediato: 2 },
                ],
                1,
                PROFUNDIDAD_ESTRUCTURA,
            ),
        ).toEqual([2]);
    });
});
