import { Module } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { CatalogsController } from './catalogs.controller';
import { CatalogsSeedService } from './seeds/catalogs-seed.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { SalaryLevelsCatalogService } from './sub-services/salary-levels-catalog.service';

@Module({
  imports: [PrismaModule],
  controllers: [CatalogsController],
  providers: [
    CatalogsService,
    //CatalogsSeedService,
    SalaryLevelsCatalogService,
    PrismaService
  ],
  exports: [CatalogsService],
})
export class CatalogsModule { }
