import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';

@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @Post()
  create(@Body() createCatalogDto: CreateCatalogDto) {
    return this.catalogsService.create(createCatalogDto);
  }

  @Get()
  findAll() {
    return this.catalogsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.catalogsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCatalogDto: UpdateCatalogDto) {
    return this.catalogsService.update(+id, updateCatalogDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.catalogsService.remove(+id);
  }
}
