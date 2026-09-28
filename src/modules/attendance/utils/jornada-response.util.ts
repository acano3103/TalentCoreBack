export interface MarcajeJornada {
  tipo: string;
  canal: string;
  fechaHoraRegistro: Date;
}

export interface JornadaConMarcajes {
  idJornada: number;
  fecha: Date;
  estatusJornada: string;
  minutosTrabajados: number;
  minutosRetardo: number;
  horaEntradaTeorica: Date | null;
  horaSalidaTeorica: Date | null;
  horaEntradaReal: Date | null;
  horaSalidaReal: Date | null;
  RegistrosAsistencia: MarcajeJornada[];
}

export const jornadaConMarcajesInclude = {
  RegistrosAsistencia: {
    orderBy: { fechaHoraRegistro: 'asc' as const },
    select: {
      idRegistro: true,
      canal: true,
      tipo: true,
      fechaHoraRegistro: true,
      resultadoGeocerca: true,
      nombreDispositivo: true,
    },
  },
};

export function mapJornadaConMarcajes(jornada: JornadaConMarcajes) {
  const entrada = jornada.RegistrosAsistencia.find((r) => r.tipo === 'ENTRADA');
  const salidaComida = jornada.RegistrosAsistencia.find(
    (r) => r.tipo === 'INICIO_COMIDA',
  );
  const entradaComida = jornada.RegistrosAsistencia.find(
    (r) => r.tipo === 'FIN_COMIDA',
  );
  const salida = jornada.RegistrosAsistencia.filter(
    (r) => r.tipo === 'SALIDA',
  ).pop();

  return {
    idJornada: jornada.idJornada,
    fecha: jornada.fecha,
    estatusJornada: jornada.estatusJornada,
    minutosTrabajados: jornada.minutosTrabajados,
    horasTrabajadasFormato: `${Math.floor(jornada.minutosTrabajados / 60)}h ${jornada.minutosTrabajados % 60}m`,
    minutosRetardo: jornada.minutosRetardo,
    horasTeoricas: {
      entrada: jornada.horaEntradaTeorica,
      salida: jornada.horaSalidaTeorica,
    },
    horasReales: {
      entrada: jornada.horaEntradaReal,
      salida: jornada.horaSalidaReal,
    },
    marcajes: {
      entrada: entrada
        ? { hora: entrada.fechaHoraRegistro, canal: entrada.canal }
        : null,
      salidaComida: salidaComida
        ? { hora: salidaComida.fechaHoraRegistro, canal: salidaComida.canal }
        : null,
      entradaComida: entradaComida
        ? { hora: entradaComida.fechaHoraRegistro, canal: entradaComida.canal }
        : null,
      salida: salida
        ? { hora: salida.fechaHoraRegistro, canal: salida.canal }
        : null,
    },
    totalRegistros: jornada.RegistrosAsistencia.length,
  };
}
