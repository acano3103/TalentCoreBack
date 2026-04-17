import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { IMessageService } from '../interfaces/message-service.interface';

@Injectable()
export class MailNotificationService implements IMessageService {
    private readonly logger = new Logger(MailNotificationService.name);

    constructor(private readonly mailerService: MailerService) { }

    async sendToken(to: string, name: string, token: string): Promise<void> {
        try {
            await this.mailerService.sendMail({
                to,
                subject: 'Código de Verificación - FileOnline',
                template: './token_email',
                context: { name, token },
            });
            this.logger.log(`Correo enviado exitosamente a ${to}`);
        } catch (error) {
            this.logger.error(`Error enviando correo a ${to}`, error);
        }
    }
}