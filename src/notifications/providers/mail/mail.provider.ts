import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { NotificationOptions } from '../../interfaces/message.interface';

@Injectable()
export class MailProvider {
    private readonly logger = new Logger(MailProvider.name);
    constructor(private readonly mailerService: MailerService) { }

    async send(payload: NotificationOptions, template: string) {
        try {
            if (!template) {
                throw new Error(`No template definido para notificación`);
            }

            const logoUrl = `${process.env.APP_URL}/public/logo-talent-core.svg`;

            await this.mailerService.sendMail({
                to: payload.to,
                subject: payload.subject || 'Notificación TalentCore',
                template: `./${template}`,
                context: {
                    ...payload.context,
                    logoUrl,
                },
            });
            this.logger.log(`Mail enviado a: ${payload.to}`);
        } catch (error) {
            this.logger.error(`Falla en Mail: ${error.message}`);
        }
    }
}