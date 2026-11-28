export interface OrganizationalDashboardKpis {
    plantillaActiva: number;        // empleados activos
    posicionesAutorizadas: number;  // ocupadas + en requisición + vacantes abiertas
    vacantesAbiertas: number;       // posiciones de vacantes aprobadas por RH
    requisicionesEnRevision: number;
    posicionesEnRequisicion: number;
    ocupacion: number;              // % ocupadas / autorizadas
    ingresos: number;               // ingresos del periodo
    bajas: number;                  // bajas aprobadas del periodo (movimientos internos)
    plantillaInicio: number;
    rotacion: number;               // % bajas / plantilla promedio del periodo
    presupuestoAsignado: number;
    presupuestoEjecutado: number;
}

export interface OrganizationalDashboardResponseDto {
    periodo: { desde: string; hasta: string };
    kpis: OrganizationalDashboardKpis;
    estadoPosiciones: { estado: 'ocupada' | 'requisicion' | 'vacante'; posiciones: number }[];
    porArea: {
        idArea: number | null;
        area: string;
        plantilla: number;
        vacantesAbiertas: number;
        enRequisicion: number;
        autorizadas: number;
        ocupacion: number;
        presupuestoAsignado: number;
    }[];
    porNivel: { nivel: string; plantilla: number }[];
    porContrato: { contrato: string; plantilla: number }[];
    porUbicacion: { idSite: number | null; ubicacion: string; plantilla: number; vacantesAbiertas: number }[];
    tendenciaMensual: { mes: string; ingresos: number; bajas: number }[];
    opciones: {
        areas: { idArea: number; nombre: string }[];
        niveles: { nombre: string }[];
        ubicaciones: { idSite: number; nombre: string }[];
    };
}
