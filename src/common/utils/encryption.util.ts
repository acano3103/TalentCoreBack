import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EncryptionService {
    private algorithm = 'aes-256-cbc';
    private key: Buffer;

    constructor(private configService: ConfigService) {
        this.key = crypto
            .createHash('sha256')
            .update(this.configService.getOrThrow<string>('ENCRYPTION_KEY'))
            .digest();
    }

    encrypt(text: string): string {
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return iv.toString('hex') + ':' + encrypted;
    }

    decrypt(text: string): string {
        const [ivHex, encrypted] = text.split(':');
        const iv = Buffer.from(ivHex, 'hex');

        const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}