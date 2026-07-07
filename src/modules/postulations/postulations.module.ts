import { Module } from '@nestjs/common';
import { PostulationsController } from './postulations.controller';
import { PostulationsService } from './postulations.service';
import { HttpModule } from '@nestjs/axios';
import { IntegrationsModule } from '../integrations/integrations.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Module({
    imports: [HttpModule,
        IntegrationsModule,
        JwtModule.registerAsync({
            useFactory: (config: ConfigService) => ({
                secret: config.get('JWT_SECRET'),
                signOptions: { algorithm: 'HS256' },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [PostulationsController],
    providers: [PostulationsService]
})
export class PostulationsModule { }