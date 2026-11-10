import {
  JornadaConMarcajes,
  mapJornadaConMarcajes,
} from './jornada-response.util';

function hora(iso: string): Date {
  return new Date(iso);
}

describe('mapJornadaConMarcajes', () => {
  it('arma la fila de jornada y se queda con la última salida', () => {
    const jornada: JornadaConMarcajes = {
      idJornada: 8,
      fecha: hora('2026-09-21T00:00:00.000Z'),
      estatusJornada: 'CERRADA',
      minutosTrabajados: 510,
      minutosRetardo: 10,
      horaEntradaTeorica: hora('1970-01-01T08:00:00.000Z'),
      horaSalidaTeorica: hora('1970-01-01T17:00:00.000Z'),
      horaEntradaReal: hora('2026-09-21T14:10:00.000Z'),
      horaSalidaReal: hora('2026-09-21T23:00:00.000Z'),
      RegistrosAsistencia: [
        { tipo: 'ENTRADA', canal: 'APP_MOVIL', fechaHoraRegistro: hora('2026-09-21T14:10:00.000Z') },
        { tipo: 'INICIO_COMIDA', canal: 'APP_MOVIL', fechaHoraRegistro: hora('2026-09-21T19:00:00.000Z') },
        { tipo: 'FIN_COMIDA', canal: 'IVR', fechaHoraRegistro: hora('2026-09-21T20:00:00.000Z') },
        { tipo: 'SALIDA', canal: 'APP_MOVIL', fechaHoraRegistro: hora('2026-09-21T21:00:00.000Z') },
        { tipo: 'SALIDA', canal: 'BIOMETRICO', fechaHoraRegistro: hora('2026-09-21T23:00:00.000Z') },
      ],
    };

    expect(mapJornadaConMarcajes(jornada)).toEqual({
      idJornada: 8,
      fecha: jornada.fecha,
      estatusJornada: 'CERRADA',
      minutosTrabajados: 510,
      horasTrabajadasFormato: '8h 30m',
      minutosRetardo: 10,
      horasTeoricas: {
        entrada: jornada.horaEntradaTeorica,
        salida: jornada.horaSalidaTeorica,
      },
      horasReales: {
        entrada: jornada.horaEntradaReal,
        salida: jornada.horaSalidaReal,
      },
      marcajes: {
        entrada: { hora: hora('2026-09-21T14:10:00.000Z'), canal: 'APP_MOVIL' },
        salidaComida: { hora: hora('2026-09-21T19:00:00.000Z'), canal: 'APP_MOVIL' },
        entradaComida: { hora: hora('2026-09-21T20:00:00.000Z'), canal: 'IVR' },
        salida: { hora: hora('2026-09-21T23:00:00.000Z'), canal: 'BIOMETRICO' },
      },
      totalRegistros: 5,
    });
  });
});
