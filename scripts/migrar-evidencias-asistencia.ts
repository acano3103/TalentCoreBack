import { isAbsolute, relative, resolve } from 'path';

/** Quita espacios y comillas sobrantes al inicio o al final de una raíz de medios. */
export function normalizarRaiz(valor: string | null | undefined): string {
    if (valor == null) return '';
    return valor.trim().replace(/^['"]+|['"]+$/g, '').trim();
}

/**
 * Ruta relativa dentro de MEDIA_ROOT_PATH.
 * `media/attendance/...` o `attendance/...` → `<slug>/attendance/...`.
 * Devuelve null si la ruta se sale de su carpeta (`..`, absoluta o vacía).
 */
export function rutaNueva(rutaVieja: string, slug: string): string | null {
    const slugLimpio = slug.trim();
    if (!slugLimpio || segmentosPeligrosos(slugLimpio)) return null;

    const normalizada = (rutaVieja ?? '').replace(/\\/g, '/').trim().replace(/^\/+/, '');
    if (!normalizada) return null;

    const sinMedia = normalizada.startsWith('media/')
        ? normalizada.slice('media/'.length)
        : normalizada;

    if (!sinMedia.startsWith('attendance/') || segmentosPeligrosos(sinMedia)) {
        return null;
    }

    return `${slugLimpio}/${sinMedia}`;
}

/**
 * `attendance/kiosk/{id}/...` o `attendance/{id}/...` (también con prefijo `media/`).
 */
export function idEmpresaDeRuta(ruta: string): number | null {
    const normalizada = (ruta ?? '').replace(/\\/g, '/').trim().replace(/^\/+/, '');
    const sinMedia = normalizada.startsWith('media/')
        ? normalizada.slice('media/'.length)
        : normalizada;

    const kiosco = /^attendance\/kiosk\/(\d+)(?:\/|$)/.exec(sinMedia);
    if (kiosco) return Number(kiosco[1]);

    const directa = /^attendance\/(\d+)(?:\/|$)/.exec(sinMedia);
    if (directa) return Number(directa[1]);

    return null;
}

/** Parte relativa a `<repo>/media`. Null si no es una ruta de evidencia legacy. */
export function relativaEnOrigen(rutaVieja: string): string | null {
    const normalizada = (rutaVieja ?? '').replace(/\\/g, '/').trim().replace(/^\/+/, '');
    if (!normalizada) return null;
    return normalizada.startsWith('media/')
        ? normalizada.slice('media/'.length)
        : normalizada;
}

/** Resuelve `relativa` dentro de `raiz`. Null si se sale de la raíz. */
export function unirDentro(raiz: string, relativa: string): string | null {
    if (!relativa || segmentosPeligrosos(relativa)) return null;
    const absoluto = resolve(raiz, relativa);
    if (!dentroDeRaiz(raiz, absoluto)) return null;
    return absoluto;
}

export function dentroDeRaiz(raiz: string, absoluto: string): boolean {
    const base = resolve(raiz);
    const destino = resolve(absoluto);
    const rel = relative(base, destino);
    if (!rel) return false;
    if (isAbsolute(rel)) return false;
    return !rel.split(/[\\/]+/).includes('..');
}

export function claveArchivo(ruta: string): string {
    const abs = resolve(ruta);
    return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

function segmentosPeligrosos(ruta: string): boolean {
    if (isAbsolute(ruta) || /^[a-zA-Z]:/.test(ruta)) return true;
    const segmentos = ruta.split(/[\\/]+/);
    return segmentos.some((segmento) => segmento === '' || segmento === '.' || segmento === '..');
}
