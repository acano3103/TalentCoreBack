export type MaterialFormato = 'pdf' | 'documento' | 'imagen' | 'video';

export interface CourseMaterial {
    id: string;
    tipo: 'archivo' | 'enlace';
    nombre: string;
    archivo?: string;
    formato?: MaterialFormato;
    tamano?: number;
    url?: string;
}

const MB = 1024 * 1024;
export const MATERIAL_MAX_BYTES = 200 * MB;
export const MATERIALES_POR_LECCION = 20;
export const ARCHIVO_MATERIAL_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/;

// Extensión → formato, tamaño máximo y firma del archivo (primeros bytes)
export const MATERIAL_TIPOS: Record<string, { formato: MaterialFormato; maxBytes: number; firma: (b: Buffer) => boolean }> = {
    '.pdf': { formato: 'pdf', maxBytes: 50 * MB, firma: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
    '.docx': { formato: 'documento', maxBytes: 50 * MB, firma: (b) => esZip(b) },
    '.pptx': { formato: 'documento', maxBytes: 50 * MB, firma: (b) => esZip(b) },
    '.xlsx': { formato: 'documento', maxBytes: 50 * MB, firma: (b) => esZip(b) },
    '.doc': { formato: 'documento', maxBytes: 50 * MB, firma: (b) => esOle(b) },
    '.ppt': { formato: 'documento', maxBytes: 50 * MB, firma: (b) => esOle(b) },
    '.xls': { formato: 'documento', maxBytes: 50 * MB, firma: (b) => esOle(b) },
    '.png': { formato: 'imagen', maxBytes: 20 * MB, firma: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    '.jpg': { formato: 'imagen', maxBytes: 20 * MB, firma: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    '.jpeg': { formato: 'imagen', maxBytes: 20 * MB, firma: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    '.webp': { formato: 'imagen', maxBytes: 20 * MB, firma: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
    '.mp4': { formato: 'video', maxBytes: 200 * MB, firma: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' },
    '.webm': { formato: 'video', maxBytes: 200 * MB, firma: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
};

function esZip(b: Buffer) {
    return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

function esOle(b: Buffer) {
    return b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}

export const materialesSubfolder = (sessionId: number) => `cursos/sesiones/${sessionId}/materiales`;
