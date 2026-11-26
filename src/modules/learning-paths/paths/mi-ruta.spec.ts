import { EmpleadoAlcance, ReglaVisible } from '../scope/resolver.service';
import { CursoFuente, armarMiRuta, origenDe, resumenMovil } from './mi-ruta';

const HOY = '2026-11-26';

function curso(
  parcial: Partial<CursoFuente> & Pick<CursoFuente, 'idCurso' | 'idRuta'>,
): CursoFuente {
  return {
    nombreRuta: parcial.idRuta === 1 ? 'Inducción' : 'Puesto',
    origen: parcial.idRuta === 1 ? 'Data Voice' : 'Líder de línea',
    etapa: 'Base',
    ordenEtapa: 1,
    ordenCurso: parcial.idCurso,
    requiereEtapaAnterior: false,
    nombre: `Curso ${parcial.idCurso}`,
    modalidad: 'online_asincrono',
    obligatorio: true,
    estado: 'inscrito',
    progreso: 0,
    fechaLimite: '2026-12-20',
    idSesion: null,
    sesionProgramada: null,
    venceEn: null,
    vigenciaMeses: null,
    ...parcial,
  };
}

describe('learning-path', () => {
  const fuentes: CursoFuente[] = [
    curso({
      idRuta: 1,
      idCurso: 1,
      nombre: 'Inducción general',
      fechaLimite: '2026-12-01',
      idSesion: 10,
    }),
    curso({
      idRuta: 2,
      idCurso: 1,
      nombre: 'Inducción general',
      fechaLimite: '2026-12-20',
      idSesion: 11,
    }),
    curso({
      idRuta: 1,
      idCurso: 2,
      nombre: 'Norma',
      estado: 'reconocido',
      progreso: 0,
      fechaLimite: '2026-11-01',
      idSesion: 20,
      venceEn: '2026-12-06',
      vigenciaMeses: 12,
    }),
    curso({
      idRuta: 1,
      idCurso: 3,
      nombre: 'Montacargas',
      etapa: 'Piso',
      ordenEtapa: 2,
      requiereEtapaAnterior: true,
      modalidad: 'presencial',
      estado: 'inscrito',
      idSesion: 30,
      fechaLimite: '2026-12-15',
      sesionProgramada: {
        fecha: '2026-12-02T15:00:00.000Z',
        lugar: 'Sala 1',
      },
    }),
    curso({
      idRuta: 1,
      idCurso: 9,
      nombre: 'Lectura opcional',
      obligatorio: false,
      estado: 'inscrito',
    }),
  ];

  it('une dos rutas, deja el curso repetido una vez, bloquea la etapa y agenda el presencial con sesión', () => {
    const ruta = armarMiRuta(fuentes, HOY, 30);

    expect(ruta.rutas).toEqual([
      { idRutaAprendizaje: 1, nombre: 'Inducción', origen: 'Data Voice' },
      { idRutaAprendizaje: 2, nombre: 'Puesto', origen: 'Líder de línea' },
    ]);
    expect(ruta.avance).toEqual({ completados: 1, total: 3 });

    const base = ruta.etapas.find((etapa) => etapa.nombre === 'Base');
    const piso = ruta.etapas.find((etapa) => etapa.nombre === 'Piso');
    expect(base?.estado).toBe('en_curso');
    expect(base?.cursos.filter((fila) => fila.idCurso === 1)).toHaveLength(1);
    expect(base?.cursos.find((fila) => fila.idCurso === 1)).toMatchObject({
      fechaLimite: '2026-12-01',
      estado: 'pendiente',
      idSesion: 10,
    });
    expect(base?.cursos.find((fila) => fila.idCurso === 2)).toMatchObject({
      estado: 'reconocido',
      progreso: 100,
    });
    expect(piso?.estado).toBe('bloqueada');
    expect(piso?.cursos).toEqual([
      expect.objectContaining({
        idCurso: 3,
        modalidad: 'presencial',
        estado: 'agendado',
        idSesion: 30,
        sesionProgramada: {
          fecha: '2026-12-02T15:00:00.000Z',
          lugar: 'Sala 1',
        },
      }),
    ]);
    expect(ruta.porRenovar).toEqual([
      {
        idCurso: 2,
        idSesion: 20,
        nombre: 'Norma',
        venceEn: '2026-12-06',
        dias: 10,
        vigenciaMeses: 12,
      },
    ]);
  });

  it('el presencial sin sesión queda por programar y el resumen usa la etapa en curso', () => {
    const ruta = armarMiRuta(
      [
        curso({
          idRuta: 1,
          idCurso: 4,
          modalidad: 'presencial',
          estado: 'por_programar',
        }),
      ],
      HOY,
      30,
    );
    expect(ruta.etapas[0].cursos[0].estado).toBe('por_programar');
    expect(ruta.etapas[0].cursos[0].sesionProgramada).toBeNull();
    expect(resumenMovil(ruta)).toMatchObject({
      etapaActual: 1,
      totalEtapas: 1,
      nombreEtapa: 'Base',
      porProgramar: 1,
      porRenovar: null,
    });
    expect(resumenMovil(armarMiRuta([], HOY, 30))).toBeNull();
  });

  it('el origen usa el puesto antes que el site y la empresa', () => {
    const empleado: EmpleadoAlcance = {
      idEmpresa: 1,
      idPuesto: 8,
      idArea: 2,
      idSite: 3,
      idUnidadOperativa: null,
      estado: 'Nuevo León',
    };
    const reglas: ReglaVisible[] = [
      { modo: 'incluir', nombreSite: 'Planta Monterrey', idSite: 3 },
      { modo: 'incluir' },
      { modo: 'incluir', nombrePuesto: 'Líder de línea', idPuesto: 8 },
    ];
    expect(origenDe(empleado, reglas, 'Data Voice')).toBe('Líder de línea');
    expect(origenDe(empleado, [{ modo: 'incluir' }], 'Data Voice')).toBe(
      'Data Voice',
    );
  });
});
