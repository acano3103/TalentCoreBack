import { Module } from '@nestjs/common';
import { ExcelExportModule } from 'src/common/services/excel-export.module';
import { WhatsappAdminController } from './whatsapp-admin.controller';
import { WhatsappAdminService } from './whatsapp-admin.service';

@Module({
    imports: [ExcelExportModule],
    controllers: [WhatsappAdminController],
    providers: [WhatsappAdminService],
})
export class WhatsappAdminModule {}
