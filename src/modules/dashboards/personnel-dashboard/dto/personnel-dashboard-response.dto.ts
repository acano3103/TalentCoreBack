export interface PersonnelDashboardKpis {
    totalEmpleados: number;
    empleadosActivos: number;
    empleadosInactivos: number;
    nuevosIngresos30d: number;
    ingresosPeriodo: number;
    bajasPeriodo: number;
    movimientosPendientes: number;
    movimientosAprobados: number;
    incidenciasPendientes: number;
    incidenciasAprobadas: number;
    diasLaboralesIncidenciasAprobadas: number;
}

export interface PersonnelDashboardResponseDto {
    periodo: { desde: string; hasta: string };
    kpis: PersonnelDashboardKpis;
    desgloseEstatusEmpleado: { estatus: 'Activo' | 'Inactivo / Baja'; total: number }[];
    movimientosPorTipo: {
        codigo: string;
        tipo: string;
        total: number;
        pendientes: number;
        aprobados: number;
    }[];
    incidenciasPorTipo: {
        codigo: string;
        tipo: string;
        total: number;
        pendientes: number;
        aprobadas: number;
        diasLaborales: number;
    }[];
    porArea: {
        idArea: number | null;
        area: string;
        activos: number;
        inactivos: number;
        nuevosIngresos30d: number;
        movimientos: number;
        incidencias: number;
    }[];
    tendenciaMensual: {
        mes: string;
        ingresos: number;
        bajas: number;
    }[];
    movimientosRecientes: {
        idMovimiento: number;
        idEmpleado: number;
        numeroEmpleado: string | null;
        nombreEmpleado: string;
        tipoMovimiento: string;
        area: string;
        puesto: string;
        estatus: string;
        fechaEfectiva: string | null;
        motivo: string | null;
        causaBaja: string | null;
        diferenciaSalarioBruto: number | null;
    }[];
    incidenciasRecientes: {
        idSolicitud: number;
        idEmpleado: number;
        numeroEmpleado: string | null;
        nombreEmpleado: string;
        tipoMovimiento: string;
        origenSolicitud: string;
        area: string;
        estatus: string;
        fechaInicio: string | null;
        fechaFin: string | null;
        totalDiasLaborales: number;
    }[];
    opciones: {
        areas: { idArea: number; nombre: string }[];
        ubicaciones: { idSite: number; nombre: string }[];
    };
}