export interface AttendanceDashboardResponseDto {
    resumenKpis: {
        presentes: { total: number; esperados: number; porcentajeAsistencia: number };
        ausentes: { total: number; porcentajePlantilla: number };
        retardos: { total: number };
        jornadasAbiertas: { total: number };
        excepciones: { total: number; pendientesValidacion: number };
    };
    distribucionCanales: {
        canal: 'APP_MOVIL' | 'IVR' | 'BIOMETRICO' | 'NFC' | 'WEB_MANUAL';
        label: string;
        total: number;
        porcentaje: number;
    }[];
    actividadPorHora: {
        hora: string; // "06:00", "07:00", etc.
        entradas: number;
        salidas: number;
        total: number;
    }[];
    ultimosMovimientos: {
        idRegistro: string;
        nombreCompleto: string;
        numeroEmpleado: string | null;
        tipo: string;
        canal: string;
        dispositivo: string | null;
        fechaHora: string;
    }[];
}