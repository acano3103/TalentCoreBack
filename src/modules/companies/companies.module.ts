import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { MediaPathModule } from 'src/common/services/media-path.module';
import { ExcelExportModule } from 'src/common/services/excel-export.module';

@Module({
  imports: [MediaPathModule, ExcelExportModule],
  controllers: [CompaniesController],
  providers: [CompaniesService]
})
export class CompaniesModule { }