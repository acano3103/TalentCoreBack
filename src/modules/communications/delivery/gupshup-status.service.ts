import { createHmac } from 'crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { errorComms } from '../comms-http';
import { clavesCoinciden } from './enlace-seguro';

const NO_COBRADOS = new Set(['FAILED', 'FAIL', 'UNDELIVERED', 'REJECTED', 'ERROR', 'FALLIDO']);

@Injectable()
export class GupshupStatusService {
    private readonly logger = new Logger(GupshupStatusService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) {}

    async aplicar(
        headers: Record<string, string | string[] | undefined>,
        body: unknown,
        token?: string,
    ): Promise<{ recibido: true }> {
        this.verificar(headers, body, token);
        const ids = idsMensaje(body);
        const estatus = estatusDe(body);
        if (!ids.length || !estatus) return { recibido: true };
        const noCobrado = NO_COBRADOS.has(estatus);
        await this.prisma.waConsumo.updateMany({
            where: { ProveedorMsgId: { in: ids } },
            data: noCobrado ? { Estatus: estatus.slice(0, 20), Costo: 0 } : { Estatus: estatus.slice(0, 20) },
        });
        await this.prisma.notificacionesEntregas.updateMany({
            where: { ProveedorMsgId: { in: ids } },
            data: noCobrado
                ? { status: 'FAILED', error_message: 'WhatsApp no entregó el mensaje.', Costo: 0 }
                : { status: 'SENT' },
        });
        return { recibido: true };
    }

    private verificar(headers: Record<string, string | string[] | undefined>, body: unknown, token?: string): void {
        const secreto = (this.config.get<string>('GUPSHUP_WEBHOOK_SECRET') ?? '').trim();
        if (!secreto) {
            this.logger.warn('GUPSHUP_WEBHOOK_SECRET no está configurado. El webhook de Gupshup queda apagado.');
            throw errorComms(
                HttpStatus.SERVICE_UNAVAILABLE,
                'WEBHOOK_NO_CONFIGURADO',
                'El webhook de WhatsApp no está configurado.',
            );
        }
        const clave = primerHeader(headers, 'x-api-key') || primerHeader(headers, 'apikey') || token?.trim() || '';
        if (clave && clavesCoinciden(clave, secreto)) return;
        const firma = primerHeader(headers, 'x-gupshup-signature');
        const esperada = createHmac('sha256', secreto).update(JSON.stringify(body ?? {})).digest('hex');
        if (firma && clavesCoinciden(firma.toLowerCase(), esperada.toLowerCase())) return;
        throw errorComms(HttpStatus.UNAUTHORIZED, 'FIRMA_INVALIDA', 'La firma del webhook no es válida.');
    }
}

function primerHeader(headers: Record<string, string | string[] | undefined>, nombre: string): string {
    const valor = headers[nombre] ?? headers[nombre.toLowerCase()];
    if (Array.isArray(valor)) return valor[0] ?? '';
    return valor ?? '';
}

function idsMensaje(body: unknown): string[] {
    if (!body || typeof body !== 'object') return [];
    const raiz = body as { messageId?: unknown; payload?: { id?: unknown; gsId?: unknown; payload?: { id?: unknown } } };
    const candidatos = [raiz.messageId, raiz.payload?.id, raiz.payload?.gsId, raiz.payload?.payload?.id];
    return [...new Set(candidatos.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))];
}

function estatusDe(body: unknown): string {
    if (!body || typeof body !== 'object') return '';
    const raiz = body as { status?: unknown; payload?: { type?: unknown; payload?: { type?: unknown } } };
    const crudo = raiz.status ?? raiz.payload?.type ?? raiz.payload?.payload?.type;
    return typeof crudo === 'string' ? crudo.trim().toUpperCase() : '';
}
