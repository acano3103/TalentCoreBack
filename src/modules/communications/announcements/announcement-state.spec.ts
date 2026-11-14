import { HttpException } from '@nestjs/common';
import {
    ESTADOS_COMUNICADO,
    EstadoComunicado,
    TRANSICIONES,
    estadoTrasProgramar,
    exigirEditable,
    exigirEnviado,
    exigirTransicion,
} from './announcement-state';

function codigo(error: unknown): string | undefined {
    if (!(error instanceof HttpException)) return undefined;
    const body = error.getResponse();
    return typeof body === 'object' && body !== null ? (body as { code?: string }).code : undefined;
}

describe('máquina de estados del comunicado', () => {
    it.each(ESTADOS_COMUNICADO)('permite quedarse en %s', (estado) => {
        expect(() => exigirTransicion(estado, estado)).not.toThrow();
    });

    it('acepta solo las transiciones de la tabla', () => {
        for (const desde of ESTADOS_COMUNICADO) {
            for (const hacia of ESTADOS_COMUNICADO) {
                if (desde === hacia) continue;
                const permitida = TRANSICIONES[desde].includes(hacia);
                if (permitida) {
                    expect(() => exigirTransicion(desde, hacia)).not.toThrow();
                    continue;
                }
                try {
                    exigirTransicion(desde, hacia);
                    throw new Error(`debería rechazar ${desde} → ${hacia}`);
                } catch (error) {
                    expect(codigo(error)).toBe('ESTADO_INVALIDO');
                }
            }
        }
    });

    it('solo deja editar borrador y programado', () => {
        exigirEditable('BORRADOR');
        exigirEditable('PROGRAMADO');
        for (const estado of ESTADOS_COMUNICADO.filter((item) => item !== 'BORRADOR' && item !== 'PROGRAMADO')) {
            expect(() => exigirEditable(estado)).toThrow(HttpException);
        }
    });

    it('solo versiona un enviado', () => {
        exigirEnviado('ENVIADO');
        expect(() => exigirEnviado('BORRADOR')).toThrow(HttpException);
    });

    it('programa un borrador y lo regresa si se quita la fecha', () => {
        expect(estadoTrasProgramar('BORRADOR', new Date('2026-12-01T00:00:00Z'))).toBe('PROGRAMADO');
        expect(estadoTrasProgramar('PROGRAMADO', null)).toBe('BORRADOR');
        expect(estadoTrasProgramar('PROGRAMADO', new Date('2026-12-01T00:00:00Z'))).toBe('PROGRAMADO');
    });

    it('no programa un enviado', () => {
        expect(() => estadoTrasProgramar('ENVIADO' as EstadoComunicado, new Date('2026-12-01T00:00:00Z'))).toThrow(HttpException);
    });
});
