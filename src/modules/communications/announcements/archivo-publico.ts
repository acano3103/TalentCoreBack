import { CommsStorageService } from './comms-storage.service';
import { nombreRecibido } from './nombre-recibido';

export interface AdjuntoPublico {
    id: number;
    nombre: string;
    mime: string;
    tamanoBytes: number;
    url: string;
    ruta: string;
}

export function mimeDeRuta(ruta: string): string {
    const extension = ruta.split('.').pop()?.toLowerCase();
    if (extension === 'png') return 'image/png';
    if (extension === 'webp') return 'image/webp';
    if (extension === 'gif') return 'image/gif';
    if (extension === 'pdf') return 'application/pdf';
    return 'image/jpeg';
}

export function presentarPortada(storage: CommsStorageService, ruta: string | null | undefined, ttlSegundos: number) {
    if (!ruta) return { portadaUrl: null, portadaRuta: null };
    const enlace = storage.enlaceArchivo(ruta, ttlSegundos, mimeDeRuta(ruta));
    return { portadaUrl: enlace.url, portadaRuta: enlace.ruta };
}

export function presentarAdjunto(
    storage: CommsStorageService,
    adjunto: { idAdjunto: number; Nombre: string; Mime: string; TamanoBytes: number; Ruta: string },
    ttlSegundos: number,
): AdjuntoPublico {
    const enlace = storage.enlaceArchivo(adjunto.Ruta, ttlSegundos, adjunto.Mime);
    return {
        id: adjunto.idAdjunto,
        nombre: adjunto.Nombre,
        mime: adjunto.Mime,
        tamanoBytes: adjunto.TamanoBytes,
        url: enlace.url,
        ruta: enlace.ruta,
    };
}

/** `inline; filename*=UTF-8''…` con el nombre visible, no el del disco. */
export function dispositionInline(nombre: string): string {
    const limpio = nombre.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 255) || 'archivo';
    const codificado = encodeURIComponent(limpio).replace(/[!'()*]/g, (caracter) => `%${caracter.charCodeAt(0).toString(16).toUpperCase()}`);
    return `inline; filename*=UTF-8''${codificado}`;
}

const PREFIJO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

export function nombreDeDescarga(almacenado: string, visible?: string | null): string {
    const base = visible?.trim() || almacenado.replace(PREFIJO_UUID, '');
    const elegido = nombreRecibido(base).replace(/[\u0000-\u001f]/g, '').trim();
    return (elegido || 'archivo').slice(0, 255);
}
