import { Module } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { CatalogsController } from './catalogs.controller';
import { CatalogsSeedService } from './seeds/catalogs-seed.service';
import { SalaryLevelsCatalogService } from './sub-services/salary-levels-catalog.service';
import { PatronalRecordsService } from './sub-services/patronal-records.service';

@Module({
  imports: [],
  controllers: [CatalogsController],
  providers: [
    CatalogsService,
    //CatalogsSeedService,
    SalaryLevelsCatalogService,
    PatronalRecordsService,
  ],
  exports: [CatalogsService],
})
export class CatalogsModule { }
