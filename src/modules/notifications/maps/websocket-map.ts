export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error' | 'system';

interface NotificationTemplateConfig {
    severity: NotificationSeverity;
    buildMessage: (context: any, fallbackSubject?: string) => string;
}

export const SOCKET_NOTIFICATION_MAP: Record<string, NotificationTemplateConfig> = {
    POSITION_STATUS_UPDATE: {
        severity: 'info',
        buildMessage: (ctx) => {
            const estado = ctx?.action === 'aprobar' ? 'APROBADO ✅' : 'RECHAZADO ❌';
            return `El perfil guardado para la posición "${ctx?.positionName || 'Sin Nombre'}" ha sido dictaminado como: ${estado}.`;
        },
    },
    INTERVIEW_SCHEDULED: {
        severity: 'warning',
        buildMessage: (ctx) => {
            return `Se ha agendado una entrevista para ti: "${ctx?.entvistasNombre || 'Asignada'}" el día ${ctx?.dia || 'Pendiente'}.`;
        },
    },
    POSITION_REQUEST_CREATED: {
        severity: 'warning',
        buildMessage: (ctx) => {
            const id = ctx?.requestId ? `#${ctx.requestId}` : '';
            const solicitante = ctx?.name ? ` por ${ctx.name}` : '';
            const desc = ctx?.shortDescription ? `: "${ctx.shortDescription}"` : '';
            return `Nueva solicitud de puesto ${id} creada${solicitante}${desc}. Disponible para revisión en Puestos > Solicitudes. 📋`;
        },
    },
    POSITION_REQUEST_STATUS_UPDATE: {
        severity: 'info',
        buildMessage: (ctx) => {
            const estado = ctx?.action === 'aprobar' ? 'APROBADA ✅' : 'RECHAZADA ❌';
            const id = ctx?.requestId ? `#${ctx.requestId}` : 'de puesto';
            const fecha = ctx?.requestDate ? ` del ${ctx.requestDate}` : '';
            return `Tu solicitud ${id}${fecha} ha sido ${estado} por el área de Recursos Humanos.`;
        },
    },
};

export function formatNotificationPayload(typeCode: string, context: any, fallbackTitle?: string) {
    const config = SOCKET_NOTIFICATION_MAP[typeCode];

    return {
        type: config?.severity || 'system',
        message: config
            ? config.buildMessage(context, fallbackTitle)
            : (fallbackTitle || 'Tienes una nueva actualización en tu bandeja de entrada.'),
    };
}