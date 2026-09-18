// attendance-config.interface.ts
export interface AttendanceModuleConfig {
    tolerancia: {
        minutosToleranciaEntrada: number;
        minutosLimiteRetardo: number;
        acumulacionRetardosParaFalta: number;
    };
    comida: {
        tiempoComidaMinutos: number;
        toleranciaComidaMinutos: number;
        obligatorioChecarComida: boolean;
    };
    salidas: {
        toleranciaSalidaAnticipadaMinutos: number;
    };
    horasExtra: {
        minutosMinimosParaHoraExtra: number;
        requiereAprobacion: boolean;
    };
    movil: {
        permitirFueraGeocercaConJustificacion: boolean;
        selfieObligatoria: boolean;
    };
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceModuleConfig = {
    tolerancia: {
        minutosToleranciaEntrada: 15,
        minutosLimiteRetardo: 60,
        acumulacionRetardosParaFalta: 3,
    },
    comida: {
        tiempoComidaMinutos: 60,
        toleranciaComidaMinutos: 5,
        obligatorioChecarComida: true,
    },
    salidas: {
        toleranciaSalidaAnticipadaMinutos: 5,
    },
    horasExtra: {
        minutosMinimosParaHoraExtra: 30,
        requiereAprobacion: true,
    },
    movil: {
        permitirFueraGeocercaConJustificacion: false,
        selfieObligatoria: true,
    },
};