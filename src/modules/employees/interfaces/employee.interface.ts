export type TipoAsistencia = 'IVR' | 'BIOMETRICO' | 'APP_MOVIL' | null;

export interface EmployeeQueryResult {
    idEmpleado: number;
    nombre: string;
    primerApellido: string;
    segundoApellido: string;
    curp: string;
    rfc: string;
    correo: string;
    telefonoMovil: string;
    idPuesto: number;
    nombrePuesto: string;
    idTipoPuesto: number;
    TipoPuesto: string;
    IdNivelSalario: number;
    NivelSalarioNombre: string;
    NivelSalarioDescripcion: string;
    NivelSalarioSalarioMinimo: number;
    NivelSalarioSalarioMaximo: number;
    idEmpresa: number;
    Empresa: string;
    idSite: number;
    Ubicacion: string;
    tipoAsistenciaUbicacionPrincipal?: TipoAsistencia;
    idArea: number;
    Area: string;
    idSalario: number | null;
    salarioBruto: number | null;
    salarioNeto: number | null;
    bono?: number | null;
    fechaInicioSalario: Date | null;
    idTipoMoneda: number | null;
    TipoMoneda: string | null;
    idPeriodicidadPago: number | null;
    PeriodicidadPago: string | null;
    idJefeDirecto: number | null;
    nombreJefeDirecto: string | null;
    primerApellidoJefeDirecto: string | null;
    segundoApellidoJefeDirecto: string | null;
    idModalidadHorario?: number | null;
    ModalidadHorario?: string | null;
    tieneUsuarioActivo?: number | boolean;
}

export interface EmployeeSchedule {
    idHorario: number;
    DiaSemana: string;
    HoraEntrada: string;
    HoraSalida: string;
    Modalidad?: string | null;
}

export interface SedeAsignadaEmpleado {
    idEmpleadoSite: number;
    idSite: number;
    nombreUbicacion: string;
    tipoAsistenciaSede: TipoAsistencia;
    metodoAsistenciaAsignado: TipoAsistencia;
    EsPrincipal: boolean | number;
    Activo: boolean | number;
}

export interface DidAutorizadoEmpleado {
    Did: string;
    idSite: number | null;
    nombreUbicacion: string;
    origen: 'UBICACION' | 'EXTRA';
    motivo: string | null;
    habilitado: 0 | 1;
}

export interface ConfiguracionAsistenciaEmpleado {
    activa: boolean;
    ubicacionPrincipal: {
        idSite: number;
        nombre: string;
        tipoAsistencia: TipoAsistencia;
    };
    sedesAutorizadas: SedeAsignadaEmpleado[];
    didsAutorizados: DidAutorizadoEmpleado[];
}

export interface EmployeeDetailResponse extends EmployeeQueryResult {
    tieneUsuarioActivo: boolean;
    horarios: EmployeeSchedule[];
    asistencia: ConfiguracionAsistenciaEmpleado;
}