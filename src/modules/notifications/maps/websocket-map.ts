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
    REQUISITION_CREATED: {
        severity: 'warning',
        buildMessage: (ctx) => {
            const solicitante = ctx?.requestingUser || 'Un coordinador';
            const puesto = ctx?.position || 'Sin Nombre';
            const vacantes = ctx?.numberOfVacancies ? ` (${ctx.numberOfVacancies} plazas)` : '';
            return `🚨 Tienes una nueva requisición por revisar: ${solicitante} ha solicitado la vacante de "${puesto}"${vacantes}. Ingresa al módulo de Reclutamiento para dictaminar.`;
        },
    },
    REQUISITION_APPROVED_BY_MANAGER: {
        severity: 'success',
        buildMessage: (ctx) => {
            const id = ctx?.requestId ? `#${ctx.requestId}` : '';
            const fecha = ctx?.requestDate ? ` del ${ctx.requestDate}` : '';
            return `🎉 ¡Buenas noticias! Tu requisición de vacante ${id}${fecha} ha sido aprobada por tu Manager y ha sido enviada al área de Recursos Humanos para su validación final y publicación.`;
        },
    },
    REQUISITION_APPROVED_BY_MANAGER_TO_RH: {
        severity: 'info',
        buildMessage: (ctx) => {
            const id = ctx?.requestId ? `#${ctx.requestId}` : '';
            const nombreRh = ctx?.name ? ` ${ctx.name}` : '';
            return `📋 Hola${nombreRh}, hay una nueva requisición ${id} autorizada por el Manager. Está lista para tu revisión final, dictamen y generación de enlaces de difusión en Reclutamiento > Requisiciones.`;
        },
    },
    REQUISITION_APPROVED_BY_RH: {
        severity: 'success',
        buildMessage: (ctx) => {
            const puesto = ctx?.positionName || 'Sin Nombre';
            return `🚀 ¡Tu requisición para el puesto de "${puesto}" ya está aprobada por Recursos Humanos y ha sido publicada oficialmente como vacante activa en TalentCore!`;
        },
    },
    INTERVIEW_SCHEDULED_INTERVIEWER: {
        severity: 'info',
        buildMessage: (ctx) => {
            return `📅 Nueva entrevista asignada: Tienes la evaluación "${ctx?.entrevistasNombre || 'Evaluación de Candidato'}" con el postulante ${ctx?.postulant || 'Candidato'} agendada para el día ${ctx?.dia || 'Pendiente'}.`;
        },
    },
    INTERVIEW_RESCHEDULED_INTERVIEWER: {
        severity: 'warning',
        buildMessage: (ctx) => {
            return `🔄 Entrevista reprogramada: La evaluación "${ctx?.entrevistasNombre || 'Evaluación de Candidato'}" con el postulante ${ctx?.postulant || 'Candidato'} ha cambiado para el día ${ctx?.dia || 'Pendiente'} a las ${ctx?.hora || 'Pendiente'}.`;
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