export type CanalCliente = 'APP' | 'WEB';

export interface SolicitudCliente {
    ip?: string;
    headers?: { [key: string]: string | string[] | undefined };
}

export interface ContextoCliente {
    canal: CanalCliente;
    ip: string | null;
    userAgent: string | null;
    dispositivo: string | null;
}

export function contextoCliente(req: SolicitudCliente, forzarApp = false): ContextoCliente {
    const cliente = leerHeader(req, 'x-client');
    return {
        canal: forzarApp || cliente?.toLowerCase() === 'mobile' ? 'APP' : 'WEB',
        ip: ipDe(req),
        userAgent: recortar(leerHeader(req, 'user-agent'), 300),
        dispositivo: recortar(leerHeader(req, 'x-device'), 120),
    };
}

function leerHeader(req: SolicitudCliente, nombre: string): string | null {
    const valor = req.headers?.[nombre];
    if (Array.isArray(valor)) return valor[0]?.trim() || null;
    return valor?.trim() || null;
}

function ipDe(req: SolicitudCliente): string | null {
    const realIp = leerHeader(req, 'x-real-ip');
    const forwarded = leerHeader(req, 'x-forwarded-for');
    const desdeForward = forwarded?.split(',')[0]?.trim() || '';
    const ip = realIp || desdeForward || req.ip || '';
    return recortar(ip || null, 45);
}

function recortar(valor: string | null, max: number): string | null {
    if (!valor) return null;
    return valor.slice(0, max);
}
