import { HttpException } from '@nestjs/common';
import {
    MAX_ADJUNTO_AVISO_BYTES,
    MAX_ADJUNTO_BYTES,
    MAX_PORTADA_BYTES,
    cabeOtroAdjunto,
    nombreRecibido,
    nombreVisible,
    validarAdjunto,
    validarPortada,
} from './adjuntos';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png')]);
const PDF = Buffer.from('%PDF-1.4 contenido');

function codigo(error: unknown): string | undefined {
    return error instanceof HttpException && typeof error.getResponse() === 'object'
        ? (error.getResponse() as { code?: string }).code
        : undefined;
}

describe('adjuntos', () => {
    it('acepta un PDF y una portada PNG', () => {
        expect(validarAdjunto({ buffer: PDF, mime: 'application/pdf', nombre: 'aviso.pdf' }, false)).toBe('application/pdf');
        expect(validarPortada({ buffer: PNG, mime: 'image/png', nombre: 'portada.png' })).toBe('image/png');
    });

    it('rechaza un ejecutable y una portada que no es imagen', () => {
        expect(codigo(capturar(() => validarAdjunto({ buffer: Buffer.from('MZ'), mime: 'application/pdf', nombre: 'x.pdf' }, false)))).toBe(
            'ADJUNTO_INVALIDO',
        );
        expect(codigo(capturar(() => validarPortada({ buffer: PDF, mime: 'application/pdf', nombre: 'portada.pdf' })))).toBe(
            'ADJUNTO_INVALIDO',
        );
    });

    it('rechaza tamaños por encima del límite', () => {
        const grande = Buffer.concat([PDF, Buffer.alloc(MAX_ADJUNTO_BYTES)]);
        const portada = Buffer.concat([PNG, Buffer.alloc(MAX_PORTADA_BYTES)]);
        const aviso = Buffer.concat([PDF, Buffer.alloc(MAX_ADJUNTO_AVISO_BYTES)]);
        expect(codigo(capturar(() => validarAdjunto({ buffer: grande, mime: 'application/pdf', nombre: 'a.pdf' }, false)))).toBe(
            'ADJUNTO_INVALIDO',
        );
        expect(codigo(capturar(() => validarPortada({ buffer: portada, mime: 'image/png', nombre: 'a.png' })))).toBe('ADJUNTO_INVALIDO');
        expect(codigo(capturar(() => validarAdjunto({ buffer: aviso, mime: 'application/pdf', nombre: 'a.pdf' }, true)))).toBe(
            'ADJUNTO_INVALIDO',
        );
    });

    it('recupera Módulos, Implementación y Año cuando Multer entrega latin1', () => {
        for (const visible of ['Módulos.pdf', 'Implementación.pdf', 'Año.pdf']) {
            const recibido = Buffer.from(visible, 'utf8').toString('latin1');
            expect(recibido).not.toBe(visible);
            expect(nombreRecibido(recibido)).toBe(visible);
            expect(nombreVisible(recibido)).toBe(visible);
        }
        expect(nombreRecibido('Módulos.pdf')).toBe('Módulos.pdf');
        expect(nombreVisible('nota.pdf')).toBe('nota.pdf');
    });

    it('no deja pasar del quinto adjunto', () => {
        expect(() => cabeOtroAdjunto(4)).not.toThrow();
        expect(codigo(capturar(() => cabeOtroAdjunto(5)))).toBe('ADJUNTO_INVALIDO');
    });
});

function capturar(fn: () => unknown): unknown {
    try {
        fn();
        return undefined;
    } catch (error) {
        return error;
    }
}
