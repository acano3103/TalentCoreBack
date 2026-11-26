import {
  EmpleadoAlcance,
  VersionAlcanzada,
  coincide,
  resumenAlcance,
  rutaEfectivaDe,
  rutasDeEmpleado,
} from './resolver.service';

const empleado: EmpleadoAlcance = {
  idEmpresa: 1,
  idPuesto: 8,
  idArea: 2,
  idSite: 4,
  idUnidadOperativa: 1,
  estado: 'Nuevo León',
};

describe('resolvedor de alcance', () => {
  it('incluye por site y excluye por puesto', () => {
    const alcance = [
      { modo: 'incluir' as const, idSite: 4, idPuesto: 8 },
      { modo: 'incluir' as const, idSite: 4 },
      { modo: 'excluir' as const, idPuesto: 8 },
    ];

    expect(coincide(empleado, alcance)).toBe(false);
    expect(coincide({ ...empleado, idPuesto: 9 }, alcance)).toBe(true);
    expect(coincide({ ...empleado, idSite: 5, idPuesto: 9 }, alcance)).toBe(
      false,
    );
    expect(
      coincide(empleado, [{ modo: 'incluir', idSite: 4, idPuesto: 9 }]),
    ).toBe(false);
  });

  it('una regla vacía alcanza a toda la empresa', () => {
    const vacia = [{ modo: 'incluir' as const }];
    expect(coincide(empleado, vacia)).toBe(true);
    expect(
      coincide(
        {
          idEmpresa: 1,
          idPuesto: null,
          idArea: null,
          idSite: null,
          idUnidadOperativa: null,
          estado: null,
        },
        vacia,
      ),
    ).toBe(true);
    expect(coincide(empleado, [])).toBe(false);
  });

  it('un empleado con dos rutas se queda con el plazo y la vigencia más cortos del curso repetido', () => {
    const versiones: VersionAlcanzada[] = [
      {
        idEmpresa: 1,
        idRutaAprendizaje: 10,
        idVersion: 1,
        numero: 1,
        alcance: [{ modo: 'incluir', idSite: 4 }],
        cursos: [
          {
            idCurso: 100,
            diaInicio: 0,
            diaFin: 30,
            obligatorio: true,
            vigenciaMeses: 12,
            idRutaAprendizaje: 10,
            idVersion: 1,
          },
        ],
      },
      {
        idEmpresa: 1,
        idRutaAprendizaje: 20,
        idVersion: 2,
        numero: 1,
        alcance: [{ modo: 'incluir' }],
        cursos: [
          {
            idCurso: 100,
            diaInicio: 5,
            diaFin: 10,
            obligatorio: false,
            vigenciaMeses: null,
            idRutaAprendizaje: 20,
            idVersion: 2,
          },
          {
            idCurso: 200,
            diaInicio: 0,
            diaFin: 15,
            obligatorio: true,
            vigenciaMeses: 6,
            idRutaAprendizaje: 20,
            idVersion: 2,
          },
        ],
      },
      {
        idEmpresa: 1,
        idRutaAprendizaje: 30,
        idVersion: 3,
        numero: 1,
        alcance: [
          { modo: 'incluir', idSite: 4 },
          { modo: 'excluir', idPuesto: 8 },
        ],
        cursos: [
          {
            idCurso: 300,
            diaInicio: 0,
            diaFin: 3,
            obligatorio: true,
            vigenciaMeses: 1,
            idRutaAprendizaje: 30,
            idVersion: 3,
          },
        ],
      },
    ];

    const suyas = rutasDeEmpleado(empleado, versiones);
    expect(suyas.map((version) => version.idRutaAprendizaje)).toEqual([10, 20]);

    const efectiva = rutaEfectivaDe(suyas);
    expect(efectiva.map((curso) => curso.idCurso).sort()).toEqual([100, 200]);
    expect(efectiva.find((curso) => curso.idCurso === 100)).toMatchObject({
      diaFin: 10,
      diaInicio: 0,
      vigenciaMeses: 12,
      obligatorio: true,
    });
  });

  it('resume un site sin puesto como todos los puestos', () => {
    expect(
      resumenAlcance([
        { modo: 'incluir', idSite: 4, nombreSite: 'Planta Monterrey' },
      ]),
    ).toBe('Site: Planta Monterrey · Todos los puestos');
  });
});
