import {
  decidirTransicion,
  desglosePlazas,
  elegirInicio,
  mesesEnPuesto,
  nivelPreparacion,
  tipoDeNiveles,
  vigenciaDe,
} from './career-plan.evaluacion';

describe('antigüedad del puesto', () => {
  it('con movimiento previo cuenta desde ese movimiento, no desde el ingreso', () => {
    const inicio = elegirInicio(
      [{ fecha: '2024-03-01' }, { fecha: '2025-06-01' }],
      '2020-01-15',
    );

    expect(inicio).toBe('2025-06-01');
    expect(mesesEnPuesto(inicio, '2026-06-01')).toBe(12);
    expect(mesesEnPuesto('2020-01-15', '2026-06-01')).toBeGreaterThan(12);
  });

  it('sin movimiento previo cuenta desde la fecha de ingreso', () => {
    const inicio = elegirInicio([], '2024-01-15');

    expect(inicio).toBe('2024-01-15');
    expect(mesesEnPuesto(inicio, '2024-08-14')).toBe(6);
    expect(mesesEnPuesto(inicio, '2024-08-15')).toBe(7);
    expect(mesesEnPuesto(elegirInicio([], null), '2026-01-01')).toBe(0);
  });
});

describe('plazas por site', () => {
  it('resta ocupados de autorizadas y suma el desglose', () => {
    const plazas = desglosePlazas(
      [
        { idSite: 2, autorizadas: 1 },
        { idSite: 5, autorizadas: 4 },
      ],
      [
        { idSite: 5, ocupadas: 1 },
        { idSite: 2, ocupadas: 1 },
        { idSite: 8, ocupadas: 2 },
      ],
      new Map([
        [5, 'Planta'],
        [2, 'Oficina'],
      ]),
    );

    expect(plazas.porSite).toEqual([
      {
        idSite: 2,
        nombre: 'Oficina',
        autorizadas: 1,
        ocupadas: 1,
        libres: 0,
      },
      {
        idSite: 5,
        nombre: 'Planta',
        autorizadas: 4,
        ocupadas: 1,
        libres: 3,
      },
      {
        idSite: 8,
        nombre: null,
        autorizadas: 0,
        ocupadas: 2,
        libres: 0,
      },
    ]);
    expect(plazas.total).toBe(3);
    expect(plazas.enSite(5)).toBe(3);
    expect(plazas.enSite(2)).toBe(0);
    expect(plazas.enSite(null)).toBe(0);
  });
});

describe('transiciones del plan', () => {
  it('en_riesgo vuelve a listo_para_ascenso si renovó antes del límite', () => {
    const transicion = decidirTransicion({
      estatus: 'en_riesgo',
      prepCompleta: true,
      cursoVencido: false,
      hoy: '2026-03-31',
      fechaLimiteRenovacion: '2026-03-31',
      diasRenovacion: 30,
    });

    expect(transicion.estatus).toBe('listo_para_ascenso');
    expect(transicion.accion).toBe('RENOVADO');
    expect(transicion.fechaLimiteRenovacion).toBeNull();
  });

  it('en_riesgo regresa a en_preparacion si pasó el límite sin renovar', () => {
    const transicion = decidirTransicion({
      estatus: 'en_riesgo',
      prepCompleta: false,
      cursoVencido: true,
      hoy: '2026-04-01',
      fechaLimiteRenovacion: '2026-03-31',
      diasRenovacion: 30,
    });

    expect(transicion.estatus).toBe('en_preparacion');
    expect(transicion.accion).toBe('REGRESO_PREPARACION');
  });

  it('listo_para_ascenso pasa a en_riesgo cuando vence un curso, con el plazo configurado', () => {
    const transicion = decidirTransicion({
      estatus: 'listo_para_ascenso',
      prepCompleta: false,
      cursoVencido: true,
      hoy: '2026-03-01',
      fechaLimiteRenovacion: null,
      diasRenovacion: 30,
    });

    expect(transicion).toMatchObject({
      estatus: 'en_riesgo',
      fechaRiesgo: true,
      fechaLimiteRenovacion: '2026-03-31',
    });
  });

  it('nominado y promovido no regresan aunque el curso venza', () => {
    for (const estatus of ['nominado', 'promovido']) {
      expect(
        decidirTransicion({
          estatus,
          prepCompleta: false,
          cursoVencido: true,
          hoy: '2026-04-01',
          fechaLimiteRenovacion: '2026-03-01',
          diasRenovacion: 30,
        }).cambio,
      ).toBe(false);
    }
  });
});

describe('nivel del camino y preparación', () => {
  it('usa el id de CatNivelesSalario como orden', () => {
    expect(tipoDeNiveles(1, 3)).toBe('ascenso');
    expect(tipoDeNiveles(3, 3)).toBe('lateral');
    expect(tipoDeNiveles(4, 2)).toBe('menor');
  });

  it('separa listo con plaza de listo sin plaza', () => {
    const base = {
      cursosCumplidos: 2,
      cursos: 2,
      antiguedadCumplida: true,
      mesesFaltantes: 0,
    };
    expect(nivelPreparacion({ ...base, plazasEnSite: 1 })).toBe('listo_ahora');
    expect(nivelPreparacion({ ...base, plazasEnSite: 0 })).toBe(
      'listo_sin_plaza',
    );
    expect(
      nivelPreparacion({
        cursosCumplidos: 2,
        cursos: 3,
        antiguedadCumplida: false,
        mesesFaltantes: 8,
        plazasEnSite: 0,
      }),
    ).toBe('uno_a_dos_anios');
  });
});

describe('vigencia del curso', () => {
  it('un curso marcado vencido deja de estar vigente', () => {
    expect(
      vigenciaDe({
        vigenciaMeses: 12,
        hoy: '2026-06-01',
        filas: [{ estado: 'vencido', vence: '2026-05-01' }],
        fechaConclusion: null,
      }),
    ).toEqual({ vigente: false, caducada: true, vence: '2026-05-01' });
  });

  it('renovar deja el curso vigente si la nueva fecha no pasó', () => {
    expect(
      vigenciaDe({
        vigenciaMeses: 12,
        hoy: '2026-06-01',
        filas: [{ estado: 'completado', vence: '2027-06-01' }],
        fechaConclusion: null,
      }).vigente,
    ).toBe(true);
  });
});
