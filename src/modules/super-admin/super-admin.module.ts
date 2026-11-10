import { Module } from '@nestjs/common';
import { TenantsModule } from './tenants/tenants.module';

@Module({
  imports: [TenantsModule]
})
export class SuperAdminModule {}
