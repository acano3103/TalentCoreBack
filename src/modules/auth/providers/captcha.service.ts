import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CaptchaService {
    private readonly logger = new Logger(CaptchaService.name);

    constructor(private readonly configService: ConfigService) { }

    async validateToken(token: string): Promise<boolean> {
        if (!token) {
            throw new BadRequestException('El token de Captcha es requerido.');
        }

        const secretKey = this.configService.get<string>('CAPTCHA_SECRET_KEY');
        const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;

        try {
            const response = await fetch(url, { method: 'POST' });
            const data = await response.json();

            // reCAPTCHA v3 devuelve un score entre 0.0 y 1.0
            // Consideramos "Bot" a cualquiera con un score menor a 0.5
            if (!data.success || (data.score !== undefined && data.score < 0.5)) {
                this.logger.warn(`Validación de Captcha fallida. Score: ${data.score ?? 'N/A'}`);
                return false;
            }

            return true;
        } catch (error) {
            this.logger.error('Error al conectar con la API de Google reCAPTCHA', error);
            throw new BadRequestException('No se pudo validar el Captcha en este momento.');
        }
    }
}