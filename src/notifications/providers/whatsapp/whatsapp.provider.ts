import { Injectable, Logger } from '@nestjs/common';
import { NotificationOptions } from '../../interfaces/message.interface';

@Injectable()
export class WhatsappProvider {
    private readonly logger = new Logger(WhatsappProvider.name);

    async send(payload: NotificationOptions) {
        if (!payload.phone) return;
        this.logger.log(`[WHATSAPP SIMULATOR] Enviando a ${payload.phone}`);
        this.logger.log(`Contenido: ${JSON.stringify(payload.context)}`);
    }
}