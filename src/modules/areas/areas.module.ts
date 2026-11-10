import { Module } from '@nestjs/common';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import { ExcelExportModule } from 'src/common/services/excel-export.module';

@Module({
  imports: [ExcelExportModule],
  controllers: [AreasController],
  providers: [AreasService]
})
export class AreasModule { }