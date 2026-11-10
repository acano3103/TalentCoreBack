import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

function parseDbUrl(url: string) {
    const u = new URL(url);
    return {
        host: u.hostname,
        port: parseInt(u.port || '3306', 10),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, ''),
        // Pool settings
        connectionLimit: 5,
        acquireTimeout: 30_000,
        connectTimeout: 30_000,
        idleTimeout: 60_000,
        minimumIdle: 1,
    };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    private readonly logger = new Logger(PrismaService.name);
    private isConnected = false;

    constructor(private readonly configService: ConfigService) {
        const dbUrl = configService.getOrThrow<string>('DATABASE_URL');
        const adapter = new PrismaMariaDb(parseDbUrl(dbUrl) as any);

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