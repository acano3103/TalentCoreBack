import { Module } from '@nestjs/common';
import { ExcelExportModule } from 'src/common/services/excel-export.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { WhatsAppCapService } from './whatsapp-cap.service';
import { WhatsappUsageController } from './whatsapp-usage.controller';
import { WhatsappUsageService } from './whatsapp-usage.service';

@Module({
    imports: [CapabilitiesModule, ExcelExportModule],
    controllers: [WhatsappUsageController],
    providers: [WhatsappUsageService, WhatsAppCapService],
    exports: [WhatsAppCapService],
})
export class WhatsappUsageModule {}
