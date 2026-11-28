import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExpoPushMessage, ExpoPushReceipt, ExpoPushTicket } from 'expo-server-sdk';

export interface MensajePush {
    to: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    prioridad?: string;
    categoria?: string | null;
    idNotificacion?: string;
    badge?: number;
    destino?: string;
}

export interface TicketPush {
    token: string;
    ticketId?: string;
    error?: string;
}

type ClienteExpo = {
    chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
    sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
    chunkPushNotificationReceiptIds(ids: string[]): string[][];
    getPushNotificationReceiptsAsync(ids: string[]): Promise<Record<string, ExpoPushReceipt>>;
};

/**
 * expo-server-sdk 8 es ESM. El proyecto compila a CommonJS, así que se carga con import().
 */
async function clienteExpo(accessToken: string | undefined): Promise<{ cliente: ClienteExpo; esToken: (token: string) => boolean }> {
    const modulo = await import('expo-server-sdk');
    const Expo = modulo.Expo;
    return {
        cliente: new Expo(accessToken ? { accessToken } : undefined),
        esToken: (token: string) => Expo.isExpoPushToken(token),
    };
}

@Injectable()
export class PushProvider {
    private readonly logger = new Logger(PushProvider.name);
    private readonly accessToken: string | undefined;
    private sdk: { cliente: ClienteExpo; esToken: (token: string) => boolean } | null = null;

    constructor(config: ConfigService) {
        const token = config.get<string>('EXPO_ACCESS_TOKEN');
        this.accessToken = token || undefined;
    }

    async enviar(mensajes: MensajePush[]): Promise<TicketPush[]> {
        const { cliente, esToken } = await this.cargar();
        const validos = mensajes.filter((mensaje) => esToken(mensaje.to));
        if (!validos.length) return [];
        const chunks = cliente.chunkPushNotifications(validos.map(aExpo));
        const tickets: TicketPush[] = [];
        for (const chunk of chunks) {
            let respuesta: ExpoPushTicket[] = [];
            try {
                respuesta = await cliente.sendPushNotificationsAsync(chunk);
            } catch (error) {
                const mensaje = error instanceof Error ? error.message : 'No se pudo enviar el push.';
                this.logger.error(`Falla en Expo: ${mensaje}`);
                for (const item of chunk) tickets.push({ token: String(item.to), error: mensaje });
                continue;
            }
            chunk.forEach((item, indice) => {
                const ticket = respuesta[indice];
                const token = String(item.to);
                if (ticket?.status === 'ok') tickets.push({ token, ticketId: ticket.id });
                else tickets.push({ token, error: ticket && 'message' in ticket ? ticket.message : 'Expo rechazó el token.' });
            });
        }
        return tickets;
    }

    async recibos(ids: string[]): Promise<Record<string, ExpoPushReceipt>> {
        const limpios = ids.filter((id) => id.trim().length > 0);
        if (!limpios.length) return {};
        const { cliente } = await this.cargar();
        const acumulado: Record<string, ExpoPushReceipt> = {};
        for (const chunk of cliente.chunkPushNotificationReceiptIds(limpios)) {
            const parte = await cliente.getPushNotificationReceiptsAsync(chunk);
            Object.assign(acumulado, parte);
        }
        return acumulado;
    }

    private async cargar() {
        if (!this.sdk) this.sdk = await clienteExpo(this.accessToken);
        return this.sdk;
    }
}

export function aExpo(mensaje: MensajePush): ExpoPushMessage {
    const prioridad = sinAcento(mensaje.prioridad ?? mensaje.data?.prioridad ?? 'NORMAL');
    const categoria = sinAcento(mensaje.categoria ?? mensaje.data?.categoria ?? '');
    const data: Record<string, string> = { ...(mensaje.data ?? {}) };
    const destino = mensaje.destino || data.destino;
    if (destino) data.destino = destino;
    if (mensaje.idNotificacion) data.idNotificacion = mensaje.idNotificacion;
    data.prioridad = prioridad;
    if (categoria) data.categoria = categoria;
    const alta = prioridad === 'CRITICA' || prioridad === 'IMPORTANTE';
    const expo: ExpoPushMessage = {
        to: mensaje.to,
        title: mensaje.title,
        body: mensaje.body,
        data,
        sound: 'default',
        channelId: canalPush(prioridad, categoria),
        priority: alta ? 'high' : 'default',
        badge: mensaje.badge ?? 0,
    };
    if (prioridad === 'CRITICA') expo.interruptionLevel = 'time-sensitive';
    return expo;
}

function canalPush(prioridad: string, categoria: string): string {
    if (prioridad === 'CRITICA') return 'criticos';
    if (categoria === 'COMUNICADO' || categoria === 'AVISO') return 'avisos';
    if (categoria === 'RECORDATORIO') return 'recordatorios';
    return 'general';
}

function sinAcento(valor: string): string {
    return valor
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}
