import { Module } from '@nestjs/common';
import { TenantsModule } from './tenants/tenants.module';
import { WhatsappAdminModule } from './whatsapp/whatsapp-admin.module';

@Module({
  imports: [TenantsModule, WhatsappAdminModule]
})
export class SuperAdminModule {}
