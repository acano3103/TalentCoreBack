import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    private readonly logger = new Logger(PrismaService.name);
    private isConnected = false;

    constructor(private readonly configService: ConfigService) {
        const dbUrl = configService.getOrThrow<string>('DATABASE_URL');
        const adapter = new PrismaMariaDb(dbUrl);

        super({ adapter });
    }

    async onModuleInit() {
        if (this.isConnected) return;

        try {
            await this.$connect();
            this.isConnected = true;
            this.logger.log('Database connection successfully established');
        } catch (error) {
            this.logger.error('Could not connect to the database', error);
        }
    }
}