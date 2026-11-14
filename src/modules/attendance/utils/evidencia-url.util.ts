const BASE_POR_DEFECTO = '/api/proxy-v2';

/**
 * URL que el front puede abrir en un href.
 * Las de Artemis (http/https) se dejan igual. Las rutas internas pasan por el proxy.
 */
export function urlEvidencia(ruta: string | null | undefined): string | null {
  if (ruta == null) return null;
  const limpia = ruta.trim();
  if (!limpia) return null;
  if (/^https?:\/\//i.test(limpia)) return limpia;

  let normalizada = limpia.replace(/\\/g, '/');
  if (!normalizada.startsWith('/')) normalizada = `/${normalizada}`;
  if (!normalizada.startsWith('/media/')) {
    normalizada = `/media${normalizada}`;
  }

  const base = (
    process.env.MEDIA_PUBLIC_URL_BASE?.trim() || BASE_POR_DEFECTO
  ).replace(/\/+$/, '');
  return `${base}${normalizada}`;
}
