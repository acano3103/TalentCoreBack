import { Module } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { CatalogsController } from './catalogs.controller';
import { PublicCatalogsController } from './public-catalogs.controller';
import { CatalogsSeedService } from './seeds/catalogs-seed.service';
import { SalaryLevelsCatalogService } from './sub-services/salary-levels-catalog.service';
import { PatronalRecordsService } from './sub-services/patronal-records.service';
import { OperatingUnitsService } from './sub-services/operating-units.service';
import { PublicCatalogsService } from './public-catalogs.service';

@Module({
  imports: [],
  controllers: [CatalogsController, PublicCatalogsController],
  providers: [
    CatalogsService,
    PublicCatalogsService,
    //CatalogsSeedService,
    SalaryLevelsCatalogService,
    PatronalRecordsService,
    OperatingUnitsService
  ],
  exports: [CatalogsService, PublicCatalogsService],
})
export class CatalogsModule { }
