export type AttendanceType =
    | 'ENTRADA'
    | 'SALIDA'
    | 'INICIO_COMIDA'
    | 'FIN_COMIDA';

export interface EmployeeRow {
    idEmpleado: number;
    numeroEmpleado: string | null;
    nombre: string | null;
    primerApellido: string | null;
    segundoApellido: string | null;
}

export interface WorkdayRow {
    idJornada: number;
    fecha: Date;
    horaEntradaTeorica: string | null;
    horaSalidaTeorica: string | null;
    horaEntradaReal: Date | null;
    horaSalidaReal: Date | null;
    minutosTrabajados: number;
    minutosRetardo: number;
    minutosExtraDobles: number;
    minutosExtraTriples: number;
    estatusJornada: string;
    horaInicioComidaReal: Date | null;
    horaFinComidaReal: Date | null;
    minutosComida: number;
    minutosComidaExcedidos: number;
    elapsedSeconds: number;
}

export interface AttendanceRecordRow {
    idRegistro: bigint;
    tipo: AttendanceType;
    fechaHoraRegistro: Date;
    canal: string;
    estatusProcesamiento: string;
}

export type DatabaseClockRow = {
    fechaActual: string;
    ahora: string;
};

export type DayOfWeek =
    | 'Domingo'
    | 'Lunes'
    | 'Martes'
    | 'Miércoles'
    | 'Jueves'
    | 'Viernes'
    | 'Sábado';