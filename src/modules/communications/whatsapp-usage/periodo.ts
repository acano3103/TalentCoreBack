import { FilaPrecioWa, precioVigente } from '../delivery/precio-wa';
import { whatsappBloqueado } from '../delivery/tope-wa';

export const ZONA_PRECIO = 'America/Mexico_City';
export const ACCIONES_TOPE = ['BLOQUEAR', 'AVISAR'] as const;

export type EstadoPrecio = 'VIGENTE' | 'PROGRAMADO' | 'HISTORICO';
export type EstadoTopeCodigo = 'OK' | 'AVISO' | 'AL_TOPE';

export interface EstadoTope {
    topeMensual: number;
    consumido: number;
    porcentaje: number;
    accion: string;
    estado: EstadoTopeCodigo;
    bloqueaEnvio: boolean;
}

export interface FilaConsumo {
    idTenant: number;
    idEmpresa: number;
    categoria: string;
    mensajes: number;
    costo: number;
}

export function mesActual(ahora: Date): string {
    return `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function mesValido(valor: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);
}

/** El consumo se corta en meses UTC, igual que la suma con la que se decide el tope. */
export function rangoMes(mes: string): { inicio: Date; fin: Date } {
    const [anio, numero] = mes.split('-').map(Number);
    return {
        inicio: new Date(Date.UTC(anio, numero - 1, 1)),
        fin: new Date(Date.UTC(anio, numero, 1)),
    };
}

export function mesesAtras(ahora: Date, cantidad: number): string[] {
    const lista: string[] = [];
    for (let i = cantidad - 1; i >= 0; i -= 1) {
        lista.push(mesActual(new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - i, 1))));
    }
    return lista;
}

export function diaEnMexico(fecha: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_PRECIO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(fecha);
}

/** `vigenteDesde` no puede caer en un día anterior a hoy en Ciudad de México. */
export function vigenciaPermitida(vigenteDesde: Date, ahora: Date): boolean {
    return diaEnMexico(vigenteDesde) >= diaEnMexico(ahora);
}

export function aNumero(valor: unknown): number {
    if (valor == null) return 0;
    const numero = typeof valor === 'number' ? valor : Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

export function redondear(valor: number, decimales: number): number {
    const factor = 10 ** decimales;
    return Math.round((valor + Number.EPSILON) * factor) / factor;
}

export function porcentajeDe(consumo: number, tope: number | null): number | null {
    if (tope == null || tope <= 0) return consumo > 0 ? 100 : 0;
    return redondear((consumo / tope) * 100, 2);
}

export function evaluarTope(entrada: {
    consumo: number;
    tope: number | null;
    accion: string | null;
    prioridad: string;
}): EstadoTope | null {
    if (entrada.tope == null) return null;
    const porcentaje = porcentajeDe(entrada.consumo, entrada.tope) ?? 0;
    const estado: EstadoTopeCodigo = porcentaje >= 100 ? 'AL_TOPE' : porcentaje >= 80 ? 'AVISO' : 'OK';
    return {
        topeMensual: redondear(entrada.tope, 2),
        consumido: redondear(entrada.consumo, 4),
        porcentaje,
        accion: (entrada.accion ?? 'BLOQUEAR').trim().toUpperCase() || 'BLOQUEAR',
        estado,
        bloqueaEnvio: whatsappBloqueado({
            prioridad: entrada.prioridad,
            consumo: entrada.consumo,
            tope: entrada.tope,
            accion: entrada.accion,
        }),
    };
}

export function debeAvisar80(consumo: number, tope: number | null, avisoMes: string | null, mes: string): boolean {
    if (tope == null || tope <= 0) return false;
    if (consumo / tope < 0.8) return false;
    return (avisoMes ?? '') !== mes;
}

export function resumirConsumo(filas: readonly FilaConsumo[], idTenant: number): {
    mensajes: number;
    costo: number;
    porCategoria: { categoria: string; mensajes: number; costo: number }[];
} {
    const propias = filas.filter((fila) => fila.idTenant === idTenant);
    const porCategoria = new Map<string, { mensajes: number; costo: number }>();
    let mensajes = 0;
    let costo = 0;
    for (const fila of propias) {
        mensajes += fila.mensajes;
        costo += fila.costo;
        const actual = porCategoria.get(fila.categoria) ?? { mensajes: 0, costo: 0 };
        actual.mensajes += fila.mensajes;
        actual.costo += fila.costo;
        porCategoria.set(fila.categoria, actual);
    }
    return {
        mensajes,
        costo: redondear(costo, 4),
        porCategoria: [...porCategoria.entries()]
            .map(([categoria, totales]) => ({
                categoria,
                mensajes: totales.mensajes,
                costo: redondear(totales.costo, 4),
            }))
            .sort((a, b) => a.categoria.localeCompare(b.categoria)),
    };
}

export interface PrecioMarcado extends FilaPrecioWa {
    id: number;
    estado: EstadoPrecio;
}

/**
 * Cada serie (un tenant, o el precio global) tiene una sola versión VIGENTE:
 * la de VigenteDesde más reciente que ya empezó. Una fecha futura es PROGRAMADO.
 */
export function marcarEstados(filas: readonly (FilaPrecioWa & { id: number })[], ahora: Date): PrecioMarcado[] {
    const grupos = new Map<string, (FilaPrecioWa & { id: number })[]>();
    for (const fila of filas) {
        const clave = fila.idTenant == null ? 'global' : String(fila.idTenant);
        const lista = grupos.get(clave) ?? [];
        lista.push(fila);
        grupos.set(clave, lista);
    }
    const vigente = new Set<number>();
    for (const lista of grupos.values()) {
        const precio = precioVigente(lista, lista[0].idTenant ?? -1, ahora, 'NORMAL');
        if (!precio) continue;
        const elegida = lista
            .filter((fila) => fila.vigenteDesde.getTime() <= ahora.getTime())
            .filter((fila) => (fila.idTenant ?? null) === (lista[0].idTenant ?? null))
            .reduce<(FilaPrecioWa & { id: number }) | null>((mejor, fila) => {
                if (!mejor) return fila;
                const delta = fila.vigenteDesde.getTime() - mejor.vigenteDesde.getTime();
                if (delta > 0) return fila;
                if (delta < 0) return mejor;
                return fila.id > mejor.id ? fila : mejor;
            }, null);
        if (elegida && precio) vigente.add(elegida.id);
    }
    return filas.map((fila) => ({
        ...fila,
        estado: fila.vigenteDesde.getTime() > ahora.getTime() ? 'PROGRAMADO' : vigente.has(fila.id) ? 'VIGENTE' : 'HISTORICO',
    }));
}
