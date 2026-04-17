// src/mail/mail.module.ts
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as fs from 'fs';
import * as handlebars from 'handlebars';
import { MailNotificationService } from 'src/auth/providers/mail-notification.service';

@Module({
    imports: [
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
                defaults: {
                    from: config.get('MAIL_FROM'),
                },
                template: {
                    dir: join(process.cwd(), 'dist/mail/templates'),
                    adapter: {
                        compile: (mail: any, callback: any, mailerOptions: any) => {
                            const templateDir = mailerOptions?.template?.dir || join(__dirname, 'templates');
                            const templateName = mail.data.template || '';
                            const templatePath = join(templateDir, `${templateName}.hbs`);

                            try {
                                const template = fs.readFileSync(templatePath, 'utf-8');
                                const compiled = handlebars.compile(template);
                                mail.data.html = compiled(mail.data.context);
                                return callback();
                            } catch (error) {
                                return callback(error);
                            }
                        }
                    },
                    options: { strict: true },
                },
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [
        {
            provide: 'INotificationService',
            useClass: MailNotificationService,
        },
    ],
    exports: ['INotificationService'],
})
export class MailModule { }