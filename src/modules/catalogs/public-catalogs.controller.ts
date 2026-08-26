import { Controller, Get, Param, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { PublicCatalogsService, CatalogKey } from './public-catalogs.service';

@ApiTags('Public Catalogs')
@Controller('job-board/companies/:companyId/')
export class PublicCatalogsController {
  constructor(private readonly publicCatalogsService: PublicCatalogsService) { }

  @Get('catalogs/:nombre')
  @ApiParam({
    name: 'nombre',
    description: 'Nombre del catálogo a consultar (solo lectura pública)',
    enum: ['empresas', 'sites', 'areas'],
  })
  @ApiOperation({
    summary: 'Obtener catálogo público (sin autenticación)',
    description:
      'Endpoint público para la bolsa de trabajo. Solo expone catálogos seguros ' +
      'de mostrar sin sesión: empresas, sites, areas.',
  })
  @ApiResponse({ status: 200, description: 'Lista de registros del catálogo.' })
  @ApiResponse({ status: 400, description: 'Catálogo no reconocido o no permitido públicamente.' })
  getPublicCatalog(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('nombre') nombre: string,
  ) {
    const allowedPublicCatalogs: CatalogKey[] = ['empresas', 'sites', 'areas'];
    if (!allowedPublicCatalogs.includes(nombre as CatalogKey)) {
      throw new BadRequestException(`El catálogo "${nombre}" no está disponible públicamente.`);
    }
    return this.publicCatalogsService.getCatalog(companyId, nombre as CatalogKey);
  }
}