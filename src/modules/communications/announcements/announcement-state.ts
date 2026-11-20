import { HttpStatus } from '@nestjs/common';
import { errorComms } from '../comms-http';

/**
 * Máquina de estados de la sección 6.4.
 * ENVIANDO y ENVIADO los produce el envío (CA6); aquí solo se permiten las transiciones.
 * Quedarse en el mismo estado (editar un borrador, corregir un enviado) no es una transición.
 */
export const ESTADOS_COMUNICADO = [
    'BORRADOR',
    'PROGRAMADO',
    'ENVIANDO',
    'ENVIADO',
    'EXPIRADO',
    'CANCELADO',
    'ARCHIVADO',
] as const;

export type EstadoComunicado = (typeof ESTADOS_COMUNICADO)[number];

export const TRANSICIONES: Record<EstadoComunicado, readonly EstadoComunicado[]> = {
    BORRADOR: ['PROGRAMADO', 'ENVIANDO', 'ARCHIVADO'],
    PROGRAMADO: ['BORRADOR', 'ENVIANDO', 'CANCELADO', 'ARCHIVADO'],
    ENVIANDO: ['ENVIADO'],
    ENVIADO: ['EXPIRADO', 'ARCHIVADO'],
    EXPIRADO: ['ARCHIVADO'],
    CANCELADO: ['ARCHIVADO'],
    ARCHIVADO: [],
};

const NOMBRE: Record<EstadoComunicado, string> = {
    BORRADOR: 'borrador',
    PROGRAMADO: 'programado',
    ENVIANDO: 'en envío',
    ENVIADO: 'enviado',
    EXPIRADO: 'expirado',
    CANCELADO: 'cancelado',
    ARCHIVADO: 'archivado',
};

export function esEstadoComunicado(valor: string): valor is EstadoComunicado {
    return (ESTADOS_COMUNICADO as readonly string[]).includes(valor);
}

export function exigirTransicion(desde: EstadoComunicado, hacia: EstadoComunicado): void {
    if (desde === hacia) return;
    if (!TRANSICIONES[desde].includes(hacia)) {
        throw errorComms(
            HttpStatus.CONFLICT,
            'ESTADO_INVALIDO',
            `Un comunicado ${NOMBRE[desde]} no puede pasar a ${NOMBRE[hacia]}.`,
        );
    }
}

export function exigirEditable(estado: EstadoComunicado): void {
    if (estado !== 'BORRADOR' && estado !== 'PROGRAMADO') {
        throw errorComms(
            HttpStatus.CONFLICT,
            'ESTADO_INVALIDO',
            'Solo puedes editar un comunicado en borrador o programado.',
        );
    }
}

export function exigirEnviado(estado: EstadoComunicado): void {
    if (estado !== 'ENVIADO') {
        throw errorComms(
            HttpStatus.CONFLICT,
            'ESTADO_INVALIDO',
            'Solo un comunicado enviado puede tener una versión nueva.',
        );
    }
}

/** Fecha de envío presente → PROGRAMADO. Quitarla en un programado → BORRADOR. */
export function estadoTrasProgramar(estado: EstadoComunicado, programadoPara: Date | null): EstadoComunicado {
    if (programadoPara) {
        exigirTransicion(estado, 'PROGRAMADO');
        return 'PROGRAMADO';
    }
    if (estado === 'PROGRAMADO') {
        exigirTransicion(estado, 'BORRADOR');
        return 'BORRADOR';
    }
    return estado;
}
