
export const TEMPLATE_MAP = {
    EMAIL: {
        '2FA': 'token_email',
        'POSITION_STATUS_UPDATE': 'puesto_estado',
        'INTERVIEW_SCHEDULED': 'email_entrevista',
        'CREDENTIALS_CREATED': 'documentacion_requerida',
        'POSITION_REQUEST_STATUS_UPDATE': 'puesto_solicitud_estado',
        'REQUISITION_CREATED': 'requisition_created',
        'REQUISITION_APPROVED_BY_MANAGER': 'requisicion_aprovada_manager',
        'REQUISITION_APPROVED_BY_RH': 'requisicion_publicada',
        'INTERVIEW_SCHEDULED_INTERVIEWER': 'email_entrevista_entrevistador'
    },
    WHATSAPP: {
        '2FA': 'token_whatsapp',
        'POSITION_STATUS_UPDATE': 'puesto_estado',
        'INTERVIEW_SCHEDULED': 'whatsapp_entrevista',
        'CREDENTIALS_CREATED': 'documentos_requeridos',
        'INTERVIEW_SCHEDULED_INTERVIEWER': 'whatsapp_entrevista_entrevistador'
    },
    SOCKETS: {
        'POSITION_STATUS_UPDATE': 'puesto_estado_stream',
        'POSITION_REQUEST_CREATED': 'puesto_estado_stream',
        'POSITION_REQUEST_STATUS_UPDATE': 'puesto_estado_stream',
        'REQUISITION_CREATED': 'requisicion_creada_stream',
        'REQUISITION_APPROVED_BY_MANAGER': 'requisicion_aprobada_manager_stream',
        'REQUISITION_APPROVED_BY_MANAGER_TO_RH': 'requisicion_aprobada_manager_to_rh_stream',
        'REQUISITION_APPROVED_BY_RH': 'requisicion_publicada_stream',
        'INTERVIEW_SCHEDULED_INTERVIEWER': 'interview_scheduled_interviewer_stream'
    }
};