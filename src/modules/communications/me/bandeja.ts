import { Prisma } from 'generated/prisma/client';

export const TABS_BANDEJA = ['pendientes', 'todos', 'archivados'] as const;
export type TabBandeja = (typeof TABS_BANDEJA)[number];
export const PAGINA_BANDEJA = 20;

const ESTADOS_TODOS = ['ENVIADO', 'EXPIRADO', 'ENVIANDO'] as const;

/** Pendientes: piden acuse, siguen vigentes y esta persona no confirmó la versión actual. */
export function filtroComunicado(tab: TabBandeja, ahora: Date): Prisma.ComComunicadosWhereInput {
    if (tab === 'archivados') return { Estado: 'ARCHIVADO' };
    if (tab === 'pendientes') {
        return {
            Estado: 'ENVIADO',
            AcuseModo: { in: ['LEIDO', 'LEI_ENTENDI'] },
            OR: [{ VigenteHasta: null }, { VigenteHasta: { gt: ahora } }],
        };
    }
    return { Estado: { in: [...ESTADOS_TODOS] } };
}

export function filtroEstadoDestinatario(tab: TabBandeja): { notIn: Array<'CONFIRMADO' | 'EXPIRADO'> } | undefined {
    if (tab !== 'pendientes') return undefined;
    return { notIn: ['CONFIRMADO', 'EXPIRADO'] };
}

export function esVigente(estado: string, vigenteHasta: Date | null, ahora: Date): boolean {
    if (estado !== 'ENVIADO') return false;
    return !vigenteHasta || vigenteHasta.getTime() > ahora.getTime();
}

/** `tipo` numérico es el id. Cualquier otro texto es el código del catálogo. */
export function filtroTipo(tipo?: string): { idTipo?: number; codigo?: string } {
    const texto = tipo?.trim() ?? '';
    if (!texto) return {};
    if (/^\d+$/.test(texto)) {
        const idTipo = Number(texto);
        return idTipo > 0 ? { idTipo } : {};
    }
    return { codigo: texto.slice(0, 40) };
}

export function diaLocal(ahora: Date, zona: string): string {
    const zonaUsada = zonaValida(zona);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: zonaUsada,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(ahora);
}

function zonaValida(zona: string): string {
    try {
        Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(new Date());
        return zona;
    } catch {
        return 'America/Mexico_City';
    }
}
