
export const TEMPLATE_MAP = {
    EMAIL: {
        '2FA': 'token_email',
        'POSITION_STATUS_UPDATE': 'puesto_estado',
        'INTERVIEW_SCHEDULED': 'email_entrevista',
        'LINK_CREATED': 'documentacion_requerida',
        'POSITION_REQUEST_STATUS_UPDATE': 'puesto_solicitud_estado',
        'REQUISITION_CREATED': 'requisition_created',
        'REQUISITION_APPROVED_BY_MANAGER': 'requisicion_aprovada_manager',
        'REQUISITION_APPROVED_BY_RH': 'requisicion_publicada',
        'INTERVIEW_SCHEDULED_INTERVIEWER': 'email_entrevista_entrevistador',
        'INTERVIEW_RESCHEDULED': 'resend_entrevista',
        'INTERVIEW_RESCHEDULED_INTERVIEWER': 'resend_entrevista_entrevistador',
        'DOCUMENT_REJECTED': 'documentacion-rechazada',
         'DOCUMENT_EXPIRING': 'documentos-por-vencer',
        'CONTRACT_SIGN': 'link_firmar_contrato'
    },
    WHATSAPP: {
        'CONTRACT_SIGN': '75d01c5d-7fe9-4709-b838-12bcab8ad68e',
        'CONTRACT_SIGN_TOKEN': 'ce2b090f-ad9b-4a0b-9cc5-ae70acf99f30'
    },
    SOCKETS: {
        'POSITION_STATUS_UPDATE': 'puesto_estado_stream',
        'POSITION_REQUEST_CREATED': 'puesto_estado_stream',
        'POSITION_REQUEST_STATUS_UPDATE': 'puesto_estado_stream',
        'REQUISITION_CREATED': 'requisicion_creada_stream',
        'REQUISITION_APPROVED_BY_MANAGER': 'requisicion_aprobada_manager_stream',
        'REQUISITION_APPROVED_BY_MANAGER_TO_RH': 'requisicion_aprobada_manager_to_rh_stream',
        'REQUISITION_APPROVED_BY_RH': 'requisicion_publicada_stream',
        'INTERVIEW_SCHEDULED_INTERVIEWER': 'interview_scheduled_interviewer_stream',
        'INTERVIEW_RESCHEDULED_INTERVIEWER': 'interview_rescheduled_interviewer_stream'
    }
};