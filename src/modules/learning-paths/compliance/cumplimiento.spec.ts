import { sumar } from 'src/common/utils/dias-habiles';
import {
  agruparVencimientos,
  camposFaltantes,
  celda,
  clasificarVencimiento,
  elegirColumnas,
  entraEnAviso,
  limiteDc3,
  limiteDc4,
  resolverCursos,
  rutaAplicaAlSite,
  DatosDc3,
} from './cumplimiento';

const COMPLETO: DatosDc3 = {
  nombre: 'Ana López',
  curp: 'LOPE800101MDFLRR01',
  puesto: 'Operadora',
  rfc: 'ACM010101AAA',
  registroPatronal: 'Y1234567890',
  curso: 'Seguridad',
  duracionHoras: 8,
  periodoInicio: '2026-12-01',
  periodoFin: '2026-12-18',
  areaTematica: '3000',
  agenteCapacitador: 'Acme',
};

describe('cumplimiento', () => {
  it('la DC-3 suma 20 días hábiles y salta el 25 de diciembre y el 1 de enero', () => {
    expect(limiteDc3('2026-12-18')).toBe('2027-01-19');
    expect(limiteDc3('2026-12-18')).toBe(sumar('2026-12-18', 20));
  });

  it('la DC-4 suma 60 días hábiles al cierre de la etapa', () => {
    expect(limiteDc4('2026-12-31')).toBe(sumar('2026-12-31', 60));
  });

  it('lista el CURP faltante y no marca faltantes cuando el formato está completo', () => {
    expect(camposFaltantes({ ...COMPLETO, curp: null })).toEqual(['CURP']);
    expect(camposFaltantes(COMPLETO)).toEqual([]);
  });

  it('deja en null la celda cuando la ruta no aplica al site', () => {
    expect(rutaAplicaAlSite([{ modo: 'incluir', idSite: 9 }], 3)).toBe(false);
    expect(celda(false, 4, 4)).toBeNull();
    expect(rutaAplicaAlSite([{ modo: 'incluir' }], 3)).toBe(true);
    expect(celda(true, 1, 2)).toBe(50);
  });

  it('conserva ingreso y cumplimiento, y a lo más 6 rutas de puesto', () => {
    const puesto = Array.from({ length: 8 }, (_, indice) => ({
      idRuta: indice + 1,
      nombre: `Puesto ${indice}`,
      proposito: 'puesto',
      asignados: indice,
    }));
    const columnas = elegirColumnas([
      ...puesto,
      {
        idRuta: 20,
        nombre: 'Ingreso',
        proposito: 'ingreso',
        asignados: 1,
      },
      {
        idRuta: 21,
        nombre: 'Norma',
        proposito: 'cumplimiento',
        asignados: 2,
      },
      {
        idRuta: 22,
        nombre: 'Carrera',
        proposito: 'promocion',
        asignados: 99,
      },
    ]);
    expect(columnas.map((columna) => columna.proposito)).toEqual([
      'ingreso',
      'cumplimiento',
      ...Array.from({ length: 6 }, () => 'puesto'),
    ]);
    expect(columnas.some((columna) => columna.idRuta === 1)).toBe(false);
    expect(columnas.some((columna) => columna.proposito === 'promocion')).toBe(
      false,
    );
  });

  it('un curso reabierto deja de contar como cumplido y el vencido no está vigente', () => {
    const resueltos = resolverCursos(
      [
        fila(1, 'completado', '2026-11-01', '2027-11-01'),
        fila(1, 'inscrito', '2026-12-01', null),
        fila(2, 'completado', '2026-01-01', '2026-06-01'),
      ],
      '2026-11-26',
      30,
    );
    const reabierto = resueltos.find((curso) => curso.idEmpleado === 1);
    const vencido = resueltos.find((curso) => curso.idEmpleado === 2);
    expect(reabierto?.cumplido).toBe(false);
    expect(vencido?.cumplido).toBe(false);
    expect(vencido?.vencido).toBe(true);
  });

  it('avisa al entrar en la ventana de días hábiles y no el mismo día del límite', () => {
    expect(entraEnAviso('2026-11-26', sumar('2026-11-26', 5), 5)).toBe(true);
    expect(entraEnAviso('2026-11-26', sumar('2026-11-26', 6), 5)).toBe(false);
    expect(entraEnAviso('2026-11-26', '2026-11-26', 5)).toBe(false);
  });

  it('agrupa por curso y site, y Por aprobar gana al resto', () => {
    const grupos = agruparVencimientos(
      [
        persona(1, 'vence', '2026-12-20'),
        persona(1, 'por_aprobar', '2026-12-10'),
        persona(2, 'vencido_reasignado', '2026-11-20'),
      ],
      '2026-11-26',
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0].estado).toBe('por_aprobar');
    expect(grupos[0].personas).toBe(2);
    expect(grupos[0].etiqueta).toBe('En Por aprobar');
  });

  it('marca vencido ya reasignado cuando el plazo ya pasó y hay otra inscripción', () => {
    expect(
      clasificarVencimiento({
        vence: '2026-11-01',
        hoy: '2026-11-26',
        hayReasignacion: true,
        hayPorAprobar: false,
      }).estado,
    ).toBe('vencido_reasignado');
  });
});

function fila(
  idEmpleado: number,
  estado: string,
  fechaLimite: string,
  vence: string | null,
) {
  return {
    idEmpleado,
    idRuta: 4,
    idCurso: 9,
    idSite: 3,
    obligatorio: true,
    estado,
    fechaLimite,
    vence,
  };
}

function persona(
  idEmpleado: number,
  estado: 'vence' | 'por_aprobar' | 'vencido_reasignado',
  vence: string,
) {
  return {
    idCurso: 9,
    curso: 'Seguridad',
    idSite: 3,
    site: 'Planta',
    idEmpleado,
    vence,
    estado,
    dias: 1,
  };
}
