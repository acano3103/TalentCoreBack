import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { ExcelExportModule } from 'src/common/services/excel-export.module';

@Module({
  imports: [ExcelExportModule],
  controllers: [LocationsController],
  providers: [LocationsService]
})
export class LocationsModule { }