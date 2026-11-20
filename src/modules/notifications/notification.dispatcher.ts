import { Injectable } from "@nestjs/common";
import { Prisma } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { destinoEnPush } from "../communications/notification-center/destino";
import { whereNoLeidas } from "./campana";
import { MailProvider } from "./providers/mail/mail.provider";
import { WhatsappProvider } from "./providers/whatsapp/whatsapp.provider";
import { NotificationOptions } from "./interfaces/message.interface";
import { CanalComms, CommsPayload, EntregaComms, ResultadoDispatchComms } from "./interfaces/comms-dispatch.interface";
import { TEMPLATE_MAP } from './maps/template-map';
import { WebsocketProvider } from "./providers/websocket/websocket.provider";
import { PushProvider } from "./providers/push/push.provider";
import { CampanaRealtimeService } from "./campana-realtime.service";
import { categoriaDePreferencia, debeEnviarCanal } from "../communications/notification-center/preferencias-reglas";

@Injectable()
export class NotificationDispatcher {
    private readonly canales = new Map<string, number>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailProvider,
        private readonly whatsapp: WhatsappProvider,
        private readonly websocket: WebsocketProvider,
        private readonly push: PushProvider,
        private readonly campana: CampanaRealtimeService,
    ) { }

    async notify(options: NotificationOptions) {
        const notificationType = await this.prisma.catTipoNotificacion.findUnique({
            where: { code: options.notificationTypeCode }
        });

        if (!notificationType) {
            throw new Error(`Tipo de notificación no encontrado: ${options.notificationTypeCode}`);
        }

        const notification = await this.prisma.notificaciones.create({
            data: {
                user_uuid: options.userUuid,
                notification_type_id: notificationType.id,
                title: options.subject,
                message: JSON.stringify(options.context),
            }
        });

        const prefs = await this.prisma.preferenciasNotificacionesUsuario.findMany({
            where: {
                user_uuid: options.userUuid,
                enabled: true,
                categoria: null,
            },
            include: {
                CatCanalesNotificaciones: true
            }
        });

        const allowedChannels = await this.prisma.notificacionTipoCanales.findMany({
            where: {
                notification_type_id: notificationType.id,
                enabled: true
            },
            include: {
                CatCanalesNotificaciones: true
            }
        });

        let validChannels;

        if (prefs.length === 0) {
            const DEFAULT_CHANNELS = ['EMAIL', 'WHATSAPP', 'SOCKETS'];
            validChannels = allowedChannels.filter(c => {
                const code = c.CatCanalesNotificaciones?.code;
                return code && DEFAULT_CHANNELS.includes(code);
            });
        } else {
            validChannels = prefs.filter(pref =>
                allowedChannels.some(c => c.channel_id === pref.channel_id)
            );
        }

        const deliveries = await Promise.all(
            validChannels.map(channel =>
                this.prisma.notificacionesEntregas.create({
                    data: {
                        notification_id: notification.id,
                        channel_id: channel.channel_id || channel.id,
                        status: 'PENDING'
                    }
                })
            )
        );

        const providers = {
            EMAIL: this.mail,
            WHATSAPP: this.whatsapp,
            SOCKETS: this.websocket,
        };

        await Promise.all(deliveries.map(async (delivery) => {
            const channel = validChannels.find(c => (c.channel_id || c.id) === delivery.channel_id);

            if (!channel) return;

            const channelCode = channel.CatCanalesNotificaciones.code;
            const provider = providers[channelCode];

            if (!provider) return;

            const template = TEMPLATE_MAP[channelCode]?.[options.notificationTypeCode];
            if (!template) throw new Error(`No template para ${channelCode} - ${options.notificationTypeCode}`);

            try {
                await provider.send(options, template);
                await this.prisma.notificacionesEntregas.update({
                    where: { id: delivery.id },
                    data: {
                        status: 'SENT',
                        sent_at: new Date()
                    }
                });

            } catch (error) {
                await this.prisma.notificacionesEntregas.update({
                    where: { id: delivery.id },
                    data: {
                        status: 'FAILED',
                        error_message: error.message
                    }
                });
            }
        }));

        await this.campana.publicar(options.userUuid, null, null, {
            id: notification.id,
            titulo: options.subject ?? 'Notificación',
            mensaje: options.subject ?? '',
            categoria: null,
            prioridad: 'NORMAL',
            deepLink: null,
            creadoEn: notification.created_at ?? new Date(),
            leida: false,
        });
    }

    /**
     * Camino de comunicación interna. Respeta la matriz de preferencias en push, correo y WhatsApp.
     * La campana in-app y las celdas bloqueadas se entregan igual.
     */
    async dispatchComms(
        destinatario: { userUuid: string },
        payload: CommsPayload,
        canales: CanalComms[],
    ): Promise<ResultadoDispatchComms> {
        const notification = await this.prisma.notificaciones.create({
            data: {
                user_uuid: destinatario.userUuid,
                title: payload.titulo,
                message: payload.mensaje,
                idTenant: payload.idTenant ?? null,
                idEmpresa: payload.idEmpresa ?? null,
                Categoria: payload.categoria ?? null,
                Prioridad: payload.prioridad,
                DeepLink: payload.deepLink ?? null,
                Destino: payload.destino ? (payload.destino as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
                OrigenTipo: payload.origenTipo,
                OrigenId: payload.origenId,
                ClaveAgrupacion: payload.claveAgrupacion ?? null,
            },
        });
        const entregas: EntregaComms[] = [];
        for (const canal of canales) {
            const channelId = await this.idCanal(canal.codigo);
            const entrega = await this.prisma.notificacionesEntregas.create({
                data: {
                    notification_id: notification.id,
                    channel_id: channelId,
                    status: 'PENDIENTE',
                },
            });
            if (!canal.enviarAhora || canal.codigo === 'KIOSCO') {
                entregas.push({ id: entrega.id, canal: canal.codigo, status: 'PENDIENTE' });
                continue;
            }
            const resultado = await this.enviarCanal(canal.codigo, payload, notification.id);
            await this.prisma.notificacionesEntregas.update({
                where: { id: entrega.id },
                data: {
                    status: resultado.status,
                    sent_at: resultado.status === 'SENT' ? new Date() : null,
                    error_message: resultado.error ?? null,
                    ProveedorMsgId: resultado.proveedorMsgId ?? null,
                    Costo: resultado.costo,
                },
            });
            entregas.push({
                id: entrega.id,
                canal: canal.codigo,
                status: resultado.status,
                proveedorMsgId: resultado.proveedorMsgId,
            });
        }
        await this.publicarCampana(destinatario.userUuid, payload, notification.id, notification.created_at ?? null);
        return { notificationId: notification.id, entregas };
    }

    /** Completa entregas que se quedaron PENDIENTE (silencio de turno). */
    async completarPendientes(
        filtro: { userUuid: string; origenTipo: string; origenId: string },
        codigos: string[],
        payload: CommsPayload,
    ): Promise<EntregaComms[]> {
        const notification = await this.prisma.notificaciones.findFirst({
            where: {
                user_uuid: filtro.userUuid,
                OrigenTipo: filtro.origenTipo,
                OrigenId: filtro.origenId,
            },
            orderBy: { created_at: 'desc' },
        });
        if (!notification) return [];
        const pedidas = new Set(codigos);
        const entregas = await this.prisma.notificacionesEntregas.findMany({
            where: { notification_id: notification.id, status: 'PENDIENTE' },
        });
        const hechas: EntregaComms[] = [];
        for (const entrega of entregas) {
            const codigo = await this.codigoCanal(entrega.channel_id);
            if (!codigo || !pedidas.has(codigo) || codigo === 'KIOSCO') continue;
            const resultado = await this.enviarCanal(codigo, payload, notification.id);
            await this.prisma.notificacionesEntregas.update({
                where: { id: entrega.id },
                data: {
                    status: resultado.status,
                    sent_at: resultado.status === 'SENT' ? new Date() : null,
                    error_message: resultado.error ?? null,
                    ProveedorMsgId: resultado.proveedorMsgId ?? null,
                    Costo: resultado.costo,
                },
            });
            hechas.push({ id: entrega.id, canal: codigo, status: resultado.status, proveedorMsgId: resultado.proveedorMsgId });
        }
        return hechas;
    }

    async omitirPendientes(
        filtro: { userUuid: string; origenTipo: string; origenId: string },
        codigos: string[],
        motivo: string,
    ): Promise<void> {
        const notification = await this.prisma.notificaciones.findFirst({
            where: { user_uuid: filtro.userUuid, OrigenTipo: filtro.origenTipo, OrigenId: filtro.origenId },
            orderBy: { created_at: 'desc' },
        });
        if (!notification) return;
        const pedidas = new Set(codigos);
        const entregas = await this.prisma.notificacionesEntregas.findMany({
            where: { notification_id: notification.id, status: 'PENDIENTE' },
        });
        for (const entrega of entregas) {
            const codigo = await this.codigoCanal(entrega.channel_id);
            if (!codigo || !pedidas.has(codigo)) continue;
            await this.prisma.notificacionesEntregas.update({
                where: { id: entrega.id },
                data: { status: 'CANCELADO', error_message: motivo },
            });
        }
    }

    private async canalPermitido(codigo: CanalComms['codigo'], payload: CommsPayload): Promise<boolean> {
        const base = {
            codigo,
            categoria: payload.categoria,
            notificationTypeCode: payload.notificationTypeCode,
            origenTipo: payload.origenTipo,
            origenId: payload.origenId,
            codigoRegla: payload.codigoRegla,
            prioridad: payload.prioridad,
            requiereAcuse: payload.requiereAcuse,
        };
        if (debeEnviarCanal({ ...base, preferenciaActiva: false })) return true;
        const categoria = categoriaDePreferencia(payload);
        const channelId = await this.idCanal(codigo);
        const pref = await this.prisma.preferenciasNotificacionesUsuario.findFirst({
            where: { user_uuid: payload.userUuid, channel_id: channelId, categoria },
        });
        return debeEnviarCanal({ ...base, preferenciaActiva: pref?.enabled !== false });
    }

    private async publicarCampana(userUuid: string, payload: CommsPayload, id: string, creadoEn: Date | null) {
        await this.campana.publicar(userUuid, payload.idEmpresa ?? null, payload.idTenant ?? null, {
            id,
            titulo: payload.titulo,
            mensaje: payload.mensaje,
            categoria: payload.categoria ?? null,
            prioridad: payload.prioridad,
            deepLink: payload.deepLink ?? null,
            destino: payload.destino ?? null,
            creadoEn: creadoEn ?? new Date(),
            leida: false,
        });
    }

    private async enviarCanal(
        codigo: CanalComms['codigo'],
        payload: CommsPayload,
        idNotificacion: string,
    ): Promise<{ status: string; error?: string; proveedorMsgId?: string; costo?: number }> {
        if (!(await this.canalPermitido(codigo, payload))) {
            return { status: 'OMITIDO', error: 'La persona apagó este canal.' };
        }
        try {
            if (codigo === 'EMAIL') {
                if (!payload.correo?.to) return { status: 'FAILED', error: 'La persona no tiene correo.' };
                await this.mail.send(
                    {
                        userUuid: payload.userUuid,
                        notificationTypeCode: payload.notificationTypeCode,
                        to: payload.correo.to,
                        subject: payload.titulo,
                        context: payload.correo.context,
                    },
                    'comunicado',
                );
                return { status: 'SENT' };
            }
            if (codigo === 'WHATSAPP') {
                if (!payload.whatsapp?.phone || !payload.whatsapp.templateId) {
                    return { status: 'FAILED', error: 'Falta el teléfono o la plantilla de WhatsApp.' };
                }
                const respuesta = await this.whatsapp.send(
                    {
                        userUuid: payload.userUuid,
                        notificationTypeCode: payload.notificationTypeCode,
                        phone: payload.whatsapp.phone,
                        subject: payload.titulo,
                        context: { params: payload.whatsapp.params },
                    },
                    payload.whatsapp.templateId,
                );
                const messageId = idMensaje(respuesta);
                return { status: 'SENT', proveedorMsgId: messageId };
            }
            if (codigo === 'SOCKETS') {
                await this.websocket.send(
                    {
                        userUuid: payload.userUuid,
                        notificationTypeCode: payload.notificationTypeCode,
                        subject: payload.titulo,
                        context: { resumen: payload.mensaje, titulo: payload.titulo },
                    },
                    'comunicado_stream',
                );
                return { status: 'SENT' };
            }
            if (codigo === 'PUSH') {
                return this.enviarPush(payload, idNotificacion);
            }
            return { status: 'PENDIENTE' };
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : 'No se pudo entregar.';
            return { status: 'FAILED', error: mensaje, costo: codigo === 'WHATSAPP' ? 0 : undefined };
        }
    }

    private async enviarPush(payload: CommsPayload, idNotificacion: string): Promise<{ status: string; error?: string; proveedorMsgId?: string }> {
        const tokens = await this.prisma.pushTokens.findMany({
            where: { user_uuid: payload.userUuid, Activo: true, FechaBaja: null },
            select: { Token: true },
        });
        if (!tokens.length) return { status: 'FAILED', error: 'No hay un dispositivo con notificaciones push.' };
        const badge = await this.prisma.notificaciones.count({
            where: whereNoLeidas({
                userUuid: payload.userUuid,
                companyId: payload.idEmpresa,
                idTenant: payload.idTenant,
                ahora: new Date(),
            }),
        });
        const destino = destinoEnPush(payload.destino) ?? undefined;
        const tickets = await this.push.enviar(
            tokens.map((fila) => ({
                to: fila.Token,
                title: payload.push?.title ?? payload.titulo,
                body: payload.push?.body ?? payload.mensaje,
                data: datosPush(payload),
                prioridad: payload.prioridad,
                categoria: payload.categoria,
                idNotificacion,
                badge,
                destino,
            })),
        );
        const ok = tickets.find((ticket) => ticket.ticketId);
        for (const ticket of tickets) {
            if (!ticket.ticketId) continue;
            await this.prisma.pushTokens.updateMany({
                where: { Token: ticket.token },
                data: { UltimoTicket: ticket.ticketId, UltimoUso: new Date() },
            });
        }
        if (!ok) return { status: 'FAILED', error: tickets[0]?.error || 'Expo no aceptó el token.' };
        return { status: 'SENT', proveedorMsgId: ok.ticketId };
    }

    private async idCanal(codigo: string): Promise<number> {
        const cache = this.canales.get(codigo);
        if (cache) return cache;
        const fila = await this.prisma.catCanalesNotificaciones.findUnique({ where: { code: codigo } });
        if (!fila) throw new Error(`Canal de notificación no configurado: ${codigo}`);
        this.canales.set(codigo, fila.id);
        return fila.id;
    }

    private async codigoCanal(id: number): Promise<CanalComms['codigo'] | null> {
        for (const [codigo, canalId] of this.canales) {
            if (canalId === id) return codigo as CanalComms['codigo'];
        }
        const fila = await this.prisma.catCanalesNotificaciones.findUnique({ where: { id } });
        if (!fila) return null;
        this.canales.set(fila.code, fila.id);
        if (fila.code === 'PUSH' || fila.code === 'EMAIL' || fila.code === 'WHATSAPP' || fila.code === 'SOCKETS' || fila.code === 'KIOSCO') {
            return fila.code;
        }
        return null;
    }
}

function datosPush(payload: CommsPayload): Record<string, string> | undefined {
    const data: Record<string, string> = { ...(payload.push?.data ?? {}) };
    const destino = destinoEnPush(payload.destino);
    if (destino) data.destino = destino;
    return Object.keys(data).length ? data : undefined;
}

function idMensaje(respuesta: unknown): string | undefined {
    if (!respuesta || typeof respuesta !== 'object') return undefined;
    const cuerpo = respuesta as { messageId?: unknown; message?: { id?: unknown } };
    if (typeof cuerpo.messageId === 'string' && cuerpo.messageId) return cuerpo.messageId;
    if (typeof cuerpo.message?.id === 'string') return cuerpo.message.id;
    return undefined;
}