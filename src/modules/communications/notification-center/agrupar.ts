import { diaLocal } from '../me/bandeja';
import { DestinoNotificacion } from './destino';

export const PAGINA_CAMPANA = 20;
export const GRUPOS_TIEMPO = ['Hoy', 'Esta semana', 'Anteriores'] as const;
export type GrupoTiempo = (typeof GRUPOS_TIEMPO)[number];

export interface AvisoPlano {
    id: string;
    titulo: string | null;
    mensaje: string | null;
    categoria: string | null;
    prioridad: string;
    deepLink: string | null;
    destino: DestinoNotificacion | null;
    origenTipo: string | null;
    origenId: string | null;
    claveAgrupacion: string | null;
    creadoEn: Date | null;
    leidaEn: Date | null;
}

export interface AvisoAgrupado {
    id: string;
    ids: string[];
    titulo: string;
    mensaje: string;
    categoria: string | null;
    prioridad: string;
    deepLink: string | null;
    destino: DestinoNotificacion | null;
    origenTipo: string | null;
    origenId: string | null;
    claveAgrupacion: string | null;
    leida: boolean;
    leidaEn: Date | null;
    cantidad: number;
    creadoEn: Date | null;
}

export function tituloAgrupado(cantidad: number, titulo: string | null): string {
    const base = (titulo ?? '').trim();
    if (!base) return cantidad <= 1 ? 'notificación' : `${cantidad} notificaciones`;
    if (cantidad <= 1) return base;
    const partes = base.split(/\s+/);
    const primera = partes[0];
    const plural = /s$/i.test(primera) ? primera : `${primera}s`;
    const resto = partes.slice(1).join(' ');
    const frase = resto ? `${plural} ${resto}` : plural;
    return `${cantidad} ${frase.charAt(0).toLowerCase()}${frase.slice(1)}`;
}

export function grupoTiempo(fecha: Date, ahora: Date, zona: string): GrupoTiempo {
    const dia = diaLocal(fecha, zona);
    const hoy = diaLocal(ahora, zona);
    if (dia === hoy) return 'Hoy';
    if (dia >= lunesDe(hoy, ahora, zona)) return 'Esta semana';
    return 'Anteriores';
}

export function agruparAvisos(avisos: readonly AvisoPlano[], ahora: Date, zona: string, page: number, pageSize: number) {
    const ordenados = [...avisos].sort((a, b) => (b.creadoEn?.getTime() ?? 0) - (a.creadoEn?.getTime() ?? 0));
    const grupos = new Map<string, AvisoPlano[]>();
    const orden: string[] = [];
    for (const aviso of ordenados) {
        const bucket = grupoTiempo(aviso.creadoEn ?? ahora, ahora, zona);
        const clave = aviso.claveAgrupacion?.trim()
            ? `${bucket}:${aviso.claveAgrupacion.trim()}`
            : `${bucket}:id:${aviso.id}`;
        const lista = grupos.get(clave);
        if (lista) lista.push(aviso);
        else {
            grupos.set(clave, [aviso]);
            orden.push(clave);
        }
    }
    const items = orden.map((clave) => {
        const lista = grupos.get(clave) ?? [];
        const bucket = grupoTiempo(lista[0]?.creadoEn ?? ahora, ahora, zona);
        return { bucket, item: aItem(lista) };
    });
    const total = items.length;
    const inicio = (page - 1) * pageSize;
    const pagina = items.slice(inicio, inicio + pageSize);
    const porNombre = new Map<GrupoTiempo, AvisoAgrupado[]>();
    for (const fila of pagina) {
        const lista = porNombre.get(fila.bucket) ?? [];
        lista.push(fila.item);
        porNombre.set(fila.bucket, lista);
    }
    return {
        page,
        pageSize,
        total,
        grupos: GRUPOS_TIEMPO.filter((nombre) => porNombre.has(nombre)).map((nombre) => ({
            nombre,
            items: porNombre.get(nombre) ?? [],
        })),
    };
}

function aItem(lista: AvisoPlano[]): AvisoAgrupado {
    const reciente = lista[0];
    const leidas = lista.map((aviso) => aviso.leidaEn).filter((fecha): fecha is Date => fecha instanceof Date);
    const todasLeidas = leidas.length === lista.length && lista.length > 0;
    return {
        id: reciente.id,
        ids: lista.map((aviso) => aviso.id),
        titulo: tituloAgrupado(lista.length, reciente.titulo),
        mensaje: reciente.mensaje ?? '',
        categoria: reciente.categoria,
        prioridad: reciente.prioridad,
        deepLink: reciente.deepLink,
        destino: reciente.destino,
        origenTipo: reciente.origenTipo,
        origenId: reciente.origenId,
        claveAgrupacion: reciente.claveAgrupacion,
        leida: todasLeidas,
        leidaEn: todasLeidas ? leidas.sort((a, b) => b.getTime() - a.getTime())[0] : null,
        cantidad: lista.length,
        creadoEn: reciente.creadoEn,
    };
}

function lunesDe(hoyIso: string, ahora: Date, zona: string): string {
    const nombre = new Intl.DateTimeFormat('en-US', { timeZone: zonaValida(zona), weekday: 'short' }).format(ahora);
    const indice: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dia = indice[nombre] ?? 0;
    const retroceso = dia === 0 ? 6 : dia - 1;
    const [anio, mes, diaMes] = hoyIso.split('-').map(Number);
    const calendario = new Date(Date.UTC(anio, mes - 1, diaMes));
    calendario.setUTCDate(calendario.getUTCDate() - retroceso);
    return calendario.toISOString().slice(0, 10);
}

function zonaValida(zona: string): string {
    try {
        Intl.DateTimeFormat('en-US', { timeZone: zona }).format(new Date());
        return zona;
    } catch {
        return 'America/Mexico_City';
    }
}
