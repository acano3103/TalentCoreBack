import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { NotificationOptions } from '../../interfaces/message.interface';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsappProvider {
    private readonly logger = new Logger(WhatsappProvider.name);

    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly sourceNumber: string;
    private readonly appName: string;

    constructor(private readonly configService: ConfigService) {
        this.apiKey = this.configService.getOrThrow<string>('GUPSHUP_API_KEY');
        this.baseUrl = this.configService.getOrThrow<string>('GUPSHUP_BASE_URL');
        this.sourceNumber = this.configService.getOrThrow<string>('GUPSHUP_SOURCE_PHONE');
        this.appName = this.configService.getOrThrow<string>('GUPSHUP_APP_NAME');
    }

    async send(payload: NotificationOptions, gupshupId?: string) {
        try {
            if (!payload.phone) {
                this.logger.warn('No phone number provided for WhatsApp notification');
                return;
            }

            if (!gupshupId) {
                throw new Error('Gupshup ID is required to send WhatsApp template messages');
            }

            // Phone standardization for Mexico (+521)
            const digits = payload.phone.replace(/\D/g, '');
            let cleanDestination = digits;

            if (digits.length === 10) {
                cleanDestination = `521${digits}`;
            } else if (digits.length === 12 && digits.startsWith('52')) {
                cleanDestination = `521${digits.slice(2)}`;
            }

            // Extract params into a STRING ARRAY (Fixes "Internal Error Occured")
            let paramsArray: string[] = [];

            if (Array.isArray(payload.context)) {
                paramsArray = payload.context.map(String);
            } else if (payload.context?.params && Array.isArray(payload.context.params)) {
                paramsArray = payload.context.params.map(String);
            } else if (payload.context && typeof payload.context === 'object') {
                // Extracts values from { name: 'Juan', otp: '123456', expire: '10' }
                const { postbackTexts, ...restParams } = payload.context;
                paramsArray = Object.values(restParams).map(String);
            }

            // Construct form payload required by Gupshup
            const formData = new URLSearchParams();
            formData.append('channel', 'whatsapp');
            formData.append('source', this.sourceNumber);
            formData.append('destination', cleanDestination);
            formData.append('src.name', this.appName);
            formData.append('template', JSON.stringify({
                id: gupshupId,
                params: paramsArray
            }));

            // Optional: If you ever pass quick reply postback texts
            if (payload.context?.postbackTexts) {
                formData.append('postbackTexts', JSON.stringify(payload.context.postbackTexts));
            }

            const response = await axios.post(
                `${this.baseUrl}/template/msg`,
                formData.toString(),
                {
                    headers: {
                        'apikey': this.apiKey,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );

            this.logger.log(`WhatsApp message sent to ${cleanDestination}. Message ID: ${response.data?.messageId}`);
            return response.data;

        } catch (error) {
            const errorMessage = error.response?.data?.message || error.message;
            this.logger.error(`Failed to send WhatsApp message to ${payload.phone}: ${errorMessage}`);
            throw new Error(`Gupshup WhatsApp Error: ${errorMessage}`);
        }
    }
}