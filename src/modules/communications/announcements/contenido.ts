import { HttpStatus } from '@nestjs/common';
import { Canal } from '../channels/canales';
import { errorComms } from '../comms-http';
import { aTextoPlano, sanitizarCuerpo } from './sanitize-cuerpo';

export const LIMITE_TITULO = 120;
export const LIMITE_RESUMEN = 200;
export const LIMITE_AVISO = 500;
export const LIMITE_CUERPO = 20_000;
export const VIGENCIA_AVISO_MS = 24 * 60 * 60 * 1000;

export const PRIORIDADES = ['NORMAL', 'IMPORTANTE', 'CRITICA'] as const;
export const ACUSES = ['NINGUNO', 'LEIDO', 'LEI_ENTENDI'] as const;

export type PrioridadComunicado = (typeof PRIORIDADES)[number];
export type AcuseComunicado = (typeof ACUSES)[number];

export interface CamposContenido {
    titulo?: string;
    resumen?: string;
    cuerpoHtml?: string;
}

export interface ContenidoListo {
    titulo: string;
    resumen: string;
    cuerpoHtml: string;
}

export function exigeCritico(prioridad: string, canales: readonly string[]): boolean {
    return prioridad === 'CRITICA' || canales.includes('WHATSAPP');
}

export function plantillaWhatsAppConfigurada(valor: unknown): boolean {
    return textos(valor).length > 0;
}

export function prepararContenido(campos: CamposContenido, esAviso: boolean, exigido: boolean): ContenidoListo {
    const titulo = limpiarLinea(campos.titulo);
    const resumen = limpiarLinea(campos.resumen);
    const cuerpoEntrada = campos.cuerpoHtml ?? '';
    if (cuerpoEntrada.length > LIMITE_CUERPO) {
        throw errorComms(
            HttpStatus.BAD_REQUEST,
            'CONTENIDO_INVALIDO',
            `El cuerpo no puede pasar de ${LIMITE_CUERPO} caracteres.`,
        );
    }
    const cuerpo = esAviso ? aTextoPlano(cuerpoEntrada) : sanitizarCuerpo(cuerpoEntrada);
    if (titulo.length > LIMITE_TITULO) {
        throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', `El título no puede pasar de ${LIMITE_TITULO} caracteres.`);
    }
    if (resumen.length > LIMITE_RESUMEN) {
        throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', `El resumen no puede pasar de ${LIMITE_RESUMEN} caracteres.`);
    }
    if (esAviso && cuerpo.length > LIMITE_AVISO) {
        throw errorComms(
            HttpStatus.BAD_REQUEST,
            'CONTENIDO_INVALIDO',
            `Un aviso operativo es texto plano de hasta ${LIMITE_AVISO} caracteres.`,
        );
    }
    if (exigido) {
        const faltantes = faltanContenido(titulo, resumen, cuerpo);
        if (faltantes.length) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Completa el título, el resumen y el cuerpo.');
        }
    }
    return { titulo, resumen, cuerpoHtml: cuerpo };
}

export function faltanContenido(titulo: string, resumen: string, cuerpo: string): string[] {
    const faltantes: string[] = [];
    if (!titulo.trim()) faltantes.push('título');
    if (!resumen.trim()) faltantes.push('resumen');
    if (!cuerpo.trim()) faltantes.push('cuerpo');
    return faltantes;
}

export interface EntradaRevision {
    total: number;
    sinCanal: number;
    porCanal: { APP: number; WHATSAPP: number; CORREO: number; KIOSCO: number; SIN_CANAL: number };
    fueraDeAlcance: number[];
    canalesForzados: readonly string[];
    plantillasWhatsApp: unknown;
    costoEstimado?: number | null;
    moneda?: string | null;
    tope?: TopeRevision | null;
    vigenteHasta: Date | null;
    ahora: Date;
    esAviso: boolean;
    titulo: string;
    resumen: string;
    cuerpo: string;
}

export interface TopeRevision {
    topeMensual: number;
    consumido: number;
    porcentaje: number;
    accion: string;
    estado: 'OK' | 'AVISO' | 'AL_TOPE';
    bloqueaEnvio: boolean;
}

export interface RevisionComunicado {
    audiencia: {
        total: number;
        sinCanal: number;
        porCanal: EntradaRevision['porCanal'];
        fueraDeAlcance: number[];
    };
    whatsapp: {
        aplica: boolean;
        plantillaConfigurada: boolean;
        costoEstimado: number | null;
        moneda: string | null;
        tope: TopeRevision | null;
    };
    vigencia: {
        definida: boolean;
        vencida: boolean;
        vigenteHasta: string | null;
    };
    contenido: {
        completo: boolean;
        faltantes: string[];
    };
    listo: boolean;
}

export function armarRevision(entrada: EntradaRevision): RevisionComunicado {
    const faltantes = faltanContenido(entrada.titulo, entrada.resumen, entrada.cuerpo);
    const whatsappAplica = entrada.canalesForzados.includes('WHATSAPP') || entrada.porCanal.WHATSAPP > 0;
    const plantilla = plantillaWhatsAppConfigurada(entrada.plantillasWhatsApp);
    const definida = entrada.vigenteHasta != null;
    const vencida = definida && entrada.vigenteHasta!.getTime() <= entrada.ahora.getTime();
    const vigenciaObligatoria = entrada.esAviso && !definida;
    const listo =
        faltantes.length === 0 &&
        entrada.total > 0 &&
        entrada.fueraDeAlcance.length === 0 &&
        !vencida &&
        !vigenciaObligatoria &&
        (!whatsappAplica || plantilla);
    return {
        audiencia: {
            total: entrada.total,
            sinCanal: entrada.sinCanal,
            porCanal: entrada.porCanal,
            fueraDeAlcance: entrada.fueraDeAlcance,
        },
        whatsapp: {
            aplica: whatsappAplica,
            plantillaConfigurada: plantilla,
            costoEstimado: entrada.costoEstimado ?? null,
            moneda: entrada.moneda ?? null,
            tope: entrada.tope ?? null,
        },
        vigencia: {
            definida,
            vencida,
            vigenteHasta: entrada.vigenteHasta ? entrada.vigenteHasta.toISOString() : null,
        },
        contenido: { completo: faltantes.length === 0, faltantes },
        listo,
    };
}

export function vigenciaAviso(desde: Date): Date {
    return new Date(desde.getTime() + VIGENCIA_AVISO_MS);
}

export function esCanalForzado(valor: string): valor is Canal {
    return valor === 'APP' || valor === 'WEB' || valor === 'WHATSAPP' || valor === 'CORREO' || valor === 'KIOSCO';
}

function limpiarLinea(valor: string | undefined): string {
    if (typeof valor !== 'string') return '';
    return valor.trim().replace(/\s+/g, ' ');
}

function textos(valor: unknown): string[] {
    if (typeof valor === 'string') return valor.trim() ? [valor.trim()] : [];
    if (Array.isArray(valor)) return valor.flatMap(textos);
    if (valor && typeof valor === 'object') return Object.values(valor).flatMap(textos);
    return [];
}
