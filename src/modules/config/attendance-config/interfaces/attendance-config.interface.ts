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
    kiosco: {
        /** Otro canal, mismo empleado y tipo, dentro de esta ventana: se acepta
         *  con la bandera DOBLE_CANAL. No sustituye el antirebote del mismo canal. */
        ventanaDobleCanalSegundos: number;
        /** |desfaseRelojSegundos| por encima de este umbral enciende DESFASE_RELOJ. */
        umbralDesfaseRelojSegundos: number;
        /** Horas entre el registro y la recepción, con esOffline, para OFFLINE. */
        horasOfflineParaBandera: number;
        /** 0–100. Solo se sortea si la checada no trae otra bandera. */
        porcentajeMuestreo: number;
        /** Sin latido dentro de esta ventana, el kiosco pasa a SIN_CONEXION. */
        minutosSinLatidoParaOffline: number;
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
    kiosco: {
        ventanaDobleCanalSegundos: 300,
        umbralDesfaseRelojSegundos: 300,
        horasOfflineParaBandera: 24,
        porcentajeMuestreo: 0,
        minutosSinLatidoParaOffline: 15,
    },
};