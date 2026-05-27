import { Module } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { CatalogsController } from './catalogs.controller';
import { CatalogsSeedService } from './seeds/catalogs-seed.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [CatalogsController],
  providers: [CatalogsService, CatalogsSeedService, PrismaService],

})
export class CatalogsModule { }
