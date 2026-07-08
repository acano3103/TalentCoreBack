import { Module } from '@nestjs/common';
import { DigitalFilesController } from './digital-files.controller';
import { DigitalFilesService } from './digital-files.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NubariumService } from './services/nubarium.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { algorithm: 'HS256' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [DigitalFilesController],
  providers: [DigitalFilesService, NubariumService]
})
export class DigitalFilesModule { }
