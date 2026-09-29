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
    antirebote: {
        /** Canales de proveedor (biométrico, NFC, IVR): ignora cualquier marcaje
         *  dentro de esta ventana, sin importar el tipo. El colaborador no ve
         *  estado en un checador físico, así que repite el dedo cuando duda. */
        ventanaProveedorSegundos: number;
        /** App móvil y captura manual: solo atrapa el doble toque del mismo tipo.
         *  Ahí el usuario sí ve qué marcó. */
        ventanaMismoTipoSegundos: number;
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
    antirebote: {
        ventanaProveedorSegundos: 120,
        ventanaMismoTipoSegundos: 60,
    },
};