export type EstadoVentanaAsistencia = 'no_iniciada' | 'abierta' | 'cerrada';

export interface VentanaAsistencia {
    estado: EstadoVentanaAsistencia;
    desde: Date;
    hasta: Date;
    mensaje: string;
}

const TOLERANCIA_DEFAULT = 15;

export function ventanaAsistencia(params: {
    fechaHoraInicio: Date | string;
    fechaHoraFin: Date | string;
    minutosToleranciaQr?: number | null;
    ahora?: Date;
}): VentanaAsistencia {
    const inicio = new Date(params.fechaHoraInicio);
    const fin = new Date(params.fechaHoraFin);
    const minutos = params.minutosToleranciaQr || TOLERANCIA_DEFAULT;
    const desde = new Date(inicio.getTime() - minutos * 60_000);
    const ahora = params.ahora ?? new Date();

    if (ahora < desde) {
        const hora = inicio.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        return {
            estado: 'no_iniciada',
            desde,
            hasta: fin,
            mensaje: `El pase de lista estará disponible ${minutos} minutos antes del inicio (${hora}).`,
        };
    }

    if (ahora > fin) {
        const hora = fin.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        return {
            estado: 'cerrada',
            desde,
            hasta: fin,
            mensaje: `La clase finalizó a las ${hora}.`,
        };
    }

    return {
        estado: 'abierta',
        desde,
        hasta: fin,
        mensaje: 'Pase de lista abierto.',
    };
}

export function estadoPaginaPublica(estado: EstadoVentanaAsistencia): 'not_started' | 'active' | 'finished' {
    if (estado === 'no_iniciada') return 'not_started';
    if (estado === 'cerrada') return 'finished';
    return 'active';
}

export function ventanaJson(ventana: VentanaAsistencia) {
    return {
        estado: ventana.estado,
        desde: ventana.desde.toISOString(),
        hasta: ventana.hasta.toISOString(),
    };
}
