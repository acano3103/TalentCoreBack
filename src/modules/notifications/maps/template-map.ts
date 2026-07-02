
export const TEMPLATE_MAP = {
    EMAIL: {
        '2FA': 'token_email',
        'POSITION_STATUS_UPDATE': 'puesto_estado',
        'INTERVIEW_SCHEDULED': 'email_entrevista',
        'CREDENTIALS_CREATED': 'documentacion_requerida',
        'POSITION_REQUEST_STATUS_UPDATE': 'puesto_solicitud_estado'
    },
    WHATSAPP: {
        '2FA': 'token_whatsapp',
        'POSITION_STATUS_UPDATE': 'puesto_estado',
        'INTERVIEW_SCHEDULED': 'whatsapp_entrevista',
        'CREDENTIALS_CREATED': 'documentos_requeridos'
    },
    SOCKETS: {
        'POSITION_STATUS_UPDATE': 'puesto_estado_stream',
        'POSITION_REQUEST_CREATED': 'puesto_estado_stream',
        'POSITION_REQUEST_STATUS_UPDATE': 'puesto_estado_stream',
    }
};