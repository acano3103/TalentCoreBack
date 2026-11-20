import { HttpStatus } from '@nestjs/common';
import { errorComms } from '../comms-http';
import { nombreRecibido } from './nombre-recibido';

export { nombreRecibido } from './nombre-recibido';

export const MAX_ADJUNTOS = 5;
export const MAX_ADJUNTO_BYTES = 20 * 1024 * 1024;
export const MAX_PORTADA_BYTES = 10 * 1024 * 1024;
export const MAX_ADJUNTO_AVISO_BYTES = 2 * 1024 * 1024;

const MIMES_ADJUNTO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const MIMES_PORTADA = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type MimeAdjunto = (typeof MIMES_ADJUNTO)[number];

export interface ArchivoEntrante {
    buffer: Buffer;
    mime: string;
    nombre: string;
}

export function validarAdjunto(archivo: ArchivoEntrante, esAviso: boolean): MimeAdjunto {
    return validar(archivo, MIMES_ADJUNTO, esAviso ? MAX_ADJUNTO_AVISO_BYTES : MAX_ADJUNTO_BYTES, esAviso);
}

export function validarPortada(archivo: ArchivoEntrante): MimeAdjunto {
    return validar(archivo, MIMES_PORTADA, MAX_PORTADA_BYTES, false);
}

export function nombreVisible(nombre: string): string {
    const recibido = nombreRecibido(nombre);
    const base = (recibido.split(/[/\\]/).pop() ?? 'archivo').replace(/[\u0000-\u001f]/g, '').trim();
    return (base || 'archivo').slice(0, 255);
}

export function cabeOtroAdjunto(cantidadActual: number): void {
    if (cantidadActual >= MAX_ADJUNTOS) {
        throw errorComms(
            HttpStatus.BAD_REQUEST,
            'ADJUNTO_INVALIDO',
            `Un comunicado acepta hasta ${MAX_ADJUNTOS} adjuntos.`,
        );
    }
}

function validar(
    archivo: ArchivoEntrante,
    permitidos: readonly MimeAdjunto[],
    maximo: number,
    esAviso: boolean,
): MimeAdjunto {
    if (!archivo.buffer?.length) {
        throw errorComms(HttpStatus.BAD_REQUEST, 'ADJUNTO_INVALIDO', 'El archivo está vacío.');
    }
    if (archivo.buffer.length > maximo) {
        const limite = esAviso ? '2 MB' : maximo === MAX_PORTADA_BYTES ? '10 MB' : '20 MB';
        throw errorComms(
            HttpStatus.BAD_REQUEST,
            'ADJUNTO_INVALIDO',
            esAviso
                ? 'En un aviso operativo el adjunto no puede pasar de 2 MB.'
                : `El archivo no puede pesar más de ${limite}.`,
        );
    }
    const detectado = mimePorBytes(archivo.buffer);
    const declarado = archivo.mime?.split(';')[0]?.trim().toLowerCase();
    if (!detectado || !permitidos.includes(detectado) || (declarado && declarado !== detectado && declarado !== 'application/octet-stream')) {
        throw errorComms(
            HttpStatus.BAD_REQUEST,
            'ADJUNTO_INVALIDO',
            permitidos.includes('application/pdf')
                ? 'Solo se permiten PDF e imágenes (JPG, PNG, WebP o GIF).'
                : 'La portada solo acepta JPG, PNG o WebP.',
        );
    }
    if (!extensionCoincide(archivo.nombre, detectado)) {
        throw errorComms(HttpStatus.BAD_REQUEST, 'ADJUNTO_INVALIDO', 'La extensión del archivo no coincide con su tipo.');
    }
    return detectado;
}

function mimePorBytes(buffer: Buffer): MimeAdjunto | null {
    if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return 'image/png';
    }
    if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) {
        return 'image/gif';
    }
    if (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
        return 'image/webp';
    }
    return null;
}

function extensionCoincide(nombre: string, mime: MimeAdjunto): boolean {
    const punto = nombre.lastIndexOf('.');
    if (punto < 0) return false;
    const extension = nombre.slice(punto + 1).toLowerCase();
    const esperadas: Record<MimeAdjunto, string[]> = {
        'application/pdf': ['pdf'],
        'image/jpeg': ['jpg', 'jpeg'],
        'image/png': ['png'],
        'image/webp': ['webp'],
        'image/gif': ['gif'],
    };
    return esperadas[mime].includes(extension);
}
