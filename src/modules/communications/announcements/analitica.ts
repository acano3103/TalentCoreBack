import { CANALES, Canal, normalizarCanales } from '../channels/canales';
import { leerCampo, leerNumero, leerTexto } from '../comms-rows';

/** Primeras 72 h, en 12 cortes de 6 h. Cada corte acumula lo anterior. */
export const CORTES = 12;
export const HORAS_VENTANA = 72;
export const HORAS_POR_CORTE = HORAS_VENTANA / CORTES;
export const SEGUNDOS_POR_CORTE = HORAS_POR_CORTE * 3600;
export const SEGUNDOS_VENTANA = HORAS_VENTANA * 3600;

export const ESTADOS_DESTINATARIO = ['PENDIENTE', 'ENTREGADO', 'LEIDO', 'CONFIRMADO', 'FALLIDO', 'SIN_CANAL', 'EXPIRADO'] as const;
export type EstadoDestinatario = (typeof ESTADOS_DESTINATARIO)[number];

export const CORTES_DESGLOSE = ['site', 'area', 'position', 'staffType', 'manager'] as const;
export type CorteDesglose = (typeof CORTES_DESGLOSE)[number];

export const COLUMNAS_DESGLOSE: Record<CorteDesglose, 'idSite' | 'idArea' | 'idPuesto' | 'idTipoPersonal' | 'idJefe'> = {
    site: 'idSite',
    area: 'idArea',
    position: 'idPuesto',
    staffType: 'idTipoPersonal',
    manager: 'idJefe',
};

export const SIN_GRUPO: Record<CorteDesglose, string> = {
    site: 'Sin ubicación',
    area: 'Sin área',
    position: 'Sin puesto',
    staffType: 'Sin tipo de personal',
    manager: 'Sin jefe',
};

const ETIQUETA_MOTIVO: Record<string, string> = {
    FALLIDO: 'No se pudo entregar',
    SIN_CANAL: 'Sin canal de contacto',
};

export interface ConteoEstado {
    estado: string;
    total: number;
}

export interface KpisAnalitica {
    destinatarios: number;
    entregados: number;
    leidos: number;
    acuses: number;
    pendientes: number;
    expirados: number;
    fallidosPorMotivo: { motivo: string; etiqueta: string; total: number }[];
}

export interface PuntoCurva {
    hora: number;
    lecturas: number;
    acuses: number;
}

export interface FilaCanal {
    canal: string;
    destinatarios: number;
    entregados: number;
    leidos: number;
}

export interface CanalAnalitica {
    canal: Canal;
    destinatarios: number;
    entregados: number;
    porcentajeEntrega: number;
    porcentajeLectura: number;
}

export interface FilaGrupo {
    id: number | null;
    estado: string;
    total: number;
}

export interface GrupoAnalitica {
    id: number | null;
    nombre: string;
    destinatarios: number;
    porcentajeLectura: number;
    porcentajeAcuse: number;
    pendientes: number;
}

export interface AcuseEvidencia {
    fechaUtc: Date;
    zonaHoraria: string;
    canal: string;
    metodo: string;
    ip: string | null;
    dispositivo: string | null;
    version: number | null;
}

export interface DestinatarioEvidencia {
    colaborador: string;
    ubicacion: string;
    estado: string;
    acuses: AcuseEvidencia[];
}

export interface FilaExcelAcuse {
    colaborador: string;
    ubicacion: string;
    estado: string;
    fechaHoraLocal: string;
    canal: string;
    metodo: string;
    ip: string;
    dispositivo: string;
    version: number | '';
}

export const COLUMNAS_EVIDENCIA = [
    { header: 'Colaborador', key: 'colaborador', width: 32 },
    { header: 'Ubicación', key: 'ubicacion', width: 28 },
    { header: 'Estado', key: 'estado', width: 16 },
    { header: 'Fecha y hora local', key: 'fechaHoraLocal', width: 24 },
    { header: 'Canal', key: 'canal', width: 14 },
    { header: 'Método', key: 'metodo', width: 18 },
    { header: 'IP', key: 'ip', width: 18 },
    { header: 'Dispositivo', key: 'dispositivo', width: 28 },
    { header: 'Versión', key: 'version', width: 12 },
] as const;

const ENTREGADOS = new Set(['ENTREGADO', 'LEIDO', 'CONFIRMADO']);
const LEIDOS = new Set(['LEIDO', 'CONFIRMADO']);

export function porcentaje(parte: number, total: number): number {
    if (total <= 0 || parte <= 0) return 0;
    return Math.round((parte * 1000) / total) / 10;
}

/**
 * Conteos de ComDestinatarios. Entregados incluye quien ya leyó o confirmó.
 * Pendientes son quienes siguen sin leer (PENDIENTE o ENTREGADO).
 * Los acuses son quienes están CONFIRMADO.
 */
export function kpisDe(conteos: readonly ConteoEstado[]): KpisAnalitica {
    const por = new Map<string, number>();
    for (const fila of conteos) por.set(fila.estado, (por.get(fila.estado) ?? 0) + fila.total);
    const tomar = (estado: string) => por.get(estado) ?? 0;
    const fallidosPorMotivo = (['FALLIDO', 'SIN_CANAL'] as const)
        .map((motivo) => ({ motivo, etiqueta: ETIQUETA_MOTIVO[motivo], total: tomar(motivo) }))
        .filter((fila) => fila.total > 0);
    return {
        destinatarios: conteos.reduce((suma, fila) => suma + fila.total, 0),
        entregados: tomar('ENTREGADO') + tomar('LEIDO') + tomar('CONFIRMADO'),
        leidos: tomar('LEIDO') + tomar('CONFIRMADO'),
        acuses: tomar('CONFIRMADO'),
        pendientes: tomar('PENDIENTE') + tomar('ENTREGADO'),
        expirados: tomar('EXPIRADO'),
        fallidosPorMotivo,
    };
}

/** Corte 0 = primeras 6 h. Un evento en el segundo 72×3600 entra al último corte. */
export function corteDe(enviadoEn: Date, cuando: Date): number | null {
    const deltaSeg = Math.floor((cuando.getTime() - enviadoEn.getTime()) / 1000);
    if (deltaSeg < 0 || deltaSeg > SEGUNDOS_VENTANA) return null;
    return Math.min(Math.floor(deltaSeg / SEGUNDOS_POR_CORTE), CORTES - 1);
}

export function acumularCortes(filas: readonly { corte: number; total: number }[]): number[] {
    const cubetas = Array.from({ length: CORTES }, () => 0);
    for (const fila of filas) {
        if (!Number.isInteger(fila.corte) || fila.corte < 0 || fila.corte >= CORTES) continue;
        cubetas[fila.corte] += fila.total;
    }
    let suma = 0;
    return cubetas.map((total) => {
        suma += total;
        return suma;
    });
}

export function curvaDe(lecturas: readonly number[], acuses: readonly number[]): PuntoCurva[] {
    return Array.from({ length: CORTES }, (_, indice) => ({
        hora: (indice + 1) * HORAS_POR_CORTE,
        lecturas: lecturas[indice] ?? 0,
        acuses: acuses[indice] ?? 0,
    }));
}

/** Misma regla que el SQL de la curva, para la semilla de prueba. */
export function curvaDesdeFechas(enviadoEn: Date | null, lecturas: readonly Date[], acuses: readonly Date[]): PuntoCurva[] {
    if (!enviadoEn) return curvaDe(acumularCortes([]), acumularCortes([]));
    const aCubetas = (fechas: readonly Date[]) => {
        const filas: { corte: number; total: number }[] = [];
        for (const fecha of fechas) {
            const corte = corteDe(enviadoEn, fecha);
            if (corte == null) continue;
            filas.push({ corte, total: 1 });
        }
        return acumularCortes(filas);
    };
    return curvaDe(aCubetas(lecturas), aCubetas(acuses));
}

export function porCanalDesdeConteos(filas: readonly FilaCanal[]): CanalAnalitica[] {
    const mapa = new Map(filas.map((fila) => [fila.canal, fila]));
    return CANALES.flatMap((canal) => {
        const fila = mapa.get(canal);
        if (!fila || fila.destinatarios <= 0) return [];
        return [
            {
                canal,
                destinatarios: fila.destinatarios,
                entregados: fila.entregados,
                porcentajeEntrega: porcentaje(fila.entregados, fila.destinatarios),
                porcentajeLectura: porcentaje(fila.leidos, fila.destinatarios),
            },
        ];
    });
}

export function porCanalDePersonas(personas: readonly { estado: string; canales: readonly string[] }[]): CanalAnalitica[] {
    const mapa = new Map<string, FilaCanal>();
    for (const persona of personas) {
        const entregado = ENTREGADOS.has(persona.estado);
        const leido = LEIDOS.has(persona.estado);
        for (const canal of normalizarCanales(persona.canales)) {
            const actual = mapa.get(canal) ?? { canal, destinatarios: 0, entregados: 0, leidos: 0 };
            actual.destinatarios += 1;
            if (entregado) actual.entregados += 1;
            if (leido) actual.leidos += 1;
            mapa.set(canal, actual);
        }
    }
    return porCanalDesdeConteos([...mapa.values()]);
}

export function desgloseDe(filas: readonly FilaGrupo[], nombres: ReadonlyMap<number, string>, corte: CorteDesglose): GrupoAnalitica[] {
    const grupos = new Map<number | null, Map<string, number>>();
    for (const fila of filas) {
        const estados = grupos.get(fila.id) ?? new Map<string, number>();
        estados.set(fila.estado, (estados.get(fila.estado) ?? 0) + fila.total);
        grupos.set(fila.id, estados);
    }
    const resultado = [...grupos.entries()].map(([id, estados]) => {
        const tomar = (estado: string) => estados.get(estado) ?? 0;
        const destinatarios = [...estados.values()].reduce((suma, total) => suma + total, 0);
        const leidos = tomar('LEIDO') + tomar('CONFIRMADO');
        const acuses = tomar('CONFIRMADO');
        return {
            id,
            nombre: id == null ? SIN_GRUPO[corte] : (nombres.get(id) ?? SIN_GRUPO[corte]),
            destinatarios,
            porcentajeLectura: porcentaje(leidos, destinatarios),
            porcentajeAcuse: porcentaje(acuses, destinatarios),
            pendientes: tomar('PENDIENTE') + tomar('ENTREGADO'),
        };
    });
    return resultado.sort((a, b) => b.destinatarios - a.destinatarios || a.nombre.localeCompare(b.nombre, 'es'));
}

export function filtroReenvio(idComunicado: number, alcance: 'PENDIENTES' | 'SITE', idSite?: number) {
    return {
        idComunicado,
        Estado: 'PENDIENTE' as const,
        ...(alcance === 'SITE' ? { idSite: idSite ?? -1 } : {}),
    };
}

export function filasEvidencia(destinatarios: readonly DestinatarioEvidencia[]): FilaExcelAcuse[] {
    const filas: FilaExcelAcuse[] = [];
    for (const destinatario of destinatarios) {
        if (!destinatario.acuses.length) {
            filas.push(filaVacia(destinatario));
            continue;
        }
        for (const acuse of destinatario.acuses) {
            filas.push({
                colaborador: destinatario.colaborador,
                ubicacion: destinatario.ubicacion,
                estado: destinatario.estado,
                fechaHoraLocal: fechaLocal(acuse.fechaUtc, acuse.zonaHoraria),
                canal: acuse.canal,
                metodo: acuse.metodo,
                ip: acuse.ip ?? '',
                dispositivo: acuse.dispositivo ?? '',
                version: acuse.version ?? '',
            });
        }
    }
    return filas;
}

export function fechaLocal(utc: Date, zonaHoraria: string): string {
    const zona = zonaValida(zonaHoraria);
    const partes = new Intl.DateTimeFormat('es-MX', {
        timeZone: zona,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(utc);
    const tomar = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value ?? '';
    return `${tomar('day')}/${tomar('month')}/${tomar('year')} ${tomar('hour')}:${tomar('minute')}:${tomar('second')}`;
}

export function nombrePersona(partes: { nombre?: string | null; primerApellido?: string | null; segundoApellido?: string | null }): string {
    const texto = [partes.nombre, partes.primerApellido, partes.segundoApellido]
        .filter((parte): parte is string => typeof parte === 'string' && parte.trim().length > 0)
        .join(' ')
        .trim();
    return texto || 'Colaborador';
}

export function conteosEstado(filas: readonly object[]): ConteoEstado[] {
    return filas.map((fila) => ({ estado: leerTexto(fila, 'estado') ?? '', total: leerNumero(fila, 'total') }));
}

export function conteosCanal(filas: readonly object[]): FilaCanal[] {
    return filas.map((fila) => ({
        canal: leerTexto(fila, 'canal') ?? '',
        destinatarios: leerNumero(fila, 'destinatarios'),
        entregados: leerNumero(fila, 'entregados'),
        leidos: leerNumero(fila, 'leidos'),
    }));
}

export function conteosGrupo(filas: readonly object[]): FilaGrupo[] {
    return filas.map((fila) => ({
        id: leerId(fila, 'id'),
        estado: leerTexto(fila, 'estado') ?? '',
        total: leerNumero(fila, 'total'),
    }));
}

export function conteosCorte(filas: readonly object[]): { corte: number; total: number }[] {
    return filas.map((fila) => ({ corte: leerNumero(fila, 'corte'), total: leerNumero(fila, 'total') }));
}

export function leerId(fila: object, nombre: string): number | null {
    const valor = leerCampo(fila, nombre);
    if (valor == null || valor === '') return null;
    if (typeof valor === 'bigint') {
        const numero = Number(valor);
        return Number.isInteger(numero) && numero > 0 ? numero : null;
    }
    const numero = typeof valor === 'number' ? valor : Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function filaVacia(destinatario: DestinatarioEvidencia): FilaExcelAcuse {
    return {
        colaborador: destinatario.colaborador,
        ubicacion: destinatario.ubicacion,
        estado: destinatario.estado,
        fechaHoraLocal: '',
        canal: '',
        metodo: '',
        ip: '',
        dispositivo: '',
        version: '',
    };
}

function zonaValida(zona: string): string {
    try {
        Intl.DateTimeFormat('es-MX', { timeZone: zona }).format(new Date());
        return zona;
    } catch {
        return 'America/Mexico_City';
    }
}
