import { cierrePorMovimientoExterno } from './career-plan.cierre';

describe('cierre por movimiento externo', () => {
  it('cierra como promovido cuando el puesto actual ya es el objetivo y no hay movimiento', () => {
    expect(
      cierrePorMovimientoExterno({
        estatus: 'en_preparacion',
        idPuestoActual: 40,
        idPuestoObjetivo: 40,
        hayMovimiento: false,
      }),
    ).toEqual({ estatus: 'promovido', origen: 'movimiento externo' });
  });

  it('no cierra si el puesto actual sigue siendo otro', () => {
    expect(
      cierrePorMovimientoExterno({
        estatus: 'en_preparacion',
        idPuestoActual: 41,
        idPuestoObjetivo: 40,
        hayMovimiento: false,
      }),
    ).toBeNull();
  });

  it('no cierra si ya existe un movimiento del plan', () => {
    expect(
      cierrePorMovimientoExterno({
        estatus: 'nominado',
        idPuestoActual: 40,
        idPuestoObjetivo: 40,
        hayMovimiento: true,
      }),
    ).toBeNull();
  });

  it('no vuelve a cerrar un plan promovido o cancelado', () => {
    expect(
      cierrePorMovimientoExterno({
        estatus: 'promovido',
        idPuestoActual: 40,
        idPuestoObjetivo: 40,
        hayMovimiento: false,
      }),
    ).toBeNull();
    expect(
      cierrePorMovimientoExterno({
        estatus: 'cancelado',
        idPuestoActual: 40,
        idPuestoObjetivo: 40,
        hayMovimiento: false,
      }),
    ).toBeNull();
  });

  it('no cierra si no se conoce el puesto actual', () => {
    expect(
      cierrePorMovimientoExterno({
        estatus: 'en_preparacion',
        idPuestoActual: null,
        idPuestoObjetivo: 40,
        hayMovimiento: false,
      }),
    ).toBeNull();
  });
});
