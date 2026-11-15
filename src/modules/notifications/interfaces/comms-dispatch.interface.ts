export type CodigoCanalComms = 'PUSH' | 'EMAIL' | 'WHATSAPP' | 'SOCKETS' | 'KIOSCO';

export type PrioridadComms = 'NORMAL' | 'IMPORTANTE' | 'CRITICA';

export interface CanalComms {
    codigo: CodigoCanalComms;
    /** Falso deja la entrega PENDIENTE: el kiosco la consulta o un job la envía al salir del silencio. */
    enviarAhora: boolean;
}

export interface CommsPayload {
    userUuid: string;
    titulo: string;
    mensaje: string;
    categoria?: string | null;
    prioridad: PrioridadComms;
    deepLink?: string | null;
    origenTipo: string;
    origenId: string;
    idTenant?: number | null;
    idEmpresa?: number | null;
    notificationTypeCode: string;
    claveAgrupacion?: string | null;
    correo?: { to: string; context: Record<string, unknown> };
    whatsapp?: { phone: string; templateId: string; params: string[] };
    push?: { title: string; body: string; data?: Record<string, string> };
}

export interface EntregaComms {
    id: string;
    canal: CodigoCanalComms;
    status: string;
    proveedorMsgId?: string;
}

export interface ResultadoDispatchComms {
    notificationId: string;
    entregas: EntregaComms[];
}
