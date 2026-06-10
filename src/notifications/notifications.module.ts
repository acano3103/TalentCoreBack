import { Module, Global } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as fs from 'fs';
import * as handlebars from 'handlebars';
import { MailProvider } from './providers/mail/mail.provider';
import { WhatsappProvider } from './providers/whatsapp/whatsapp.provider';
import { NotificationDispatcher } from './notification.dispatcher';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Global()
@Module({
    imports: [
        PrismaModule,
        MailerModule.forRootAsync({
            useFactory: (config: ConfigService) => ({
                transport: {
                    host: config.get('MAIL_HOST'),
                    port: config.get('MAIL_PORT'),
                    secure: false,
                    auth: {
                        user: config.get('MAIL_USER'),
                        pass: config.get('MAIL_PASS'),
                    },
                },
                defaults: { from: config.get('MAIL_FROM') },
                template: {
                    dir: join(process.cwd(), 'dist/notifications/providers/mail/templates'),
                    adapter: {
                        compile: (mail: any, callback: any, mailerOptions: any) => {
                            const templateDir = mailerOptions?.template?.dir || join(__dirname, 'templates');
                            const templatePath = join(templateDir, `${mail.data.template}.hbs`);
                            try {
                                const template = fs.readFileSync(templatePath, 'utf-8');
                                const compiled = handlebars.compile(template);
                                mail.data.html = compiled(mail.data.context);
                                return callback();
                            } catch (error) { return callback(error); }
                        }
                    },
                    options: { strict: true },
                },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [NotificationsController],
    providers: [MailProvider, WhatsappProvider, NotificationDispatcher, NotificationsService],
    exports: [NotificationDispatcher],
})
export class NotificationsModule { }