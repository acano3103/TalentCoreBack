import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { CatalogsService, CatalogKey } from './catalogs.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@ApiTags('Catalogs')
@UseGuards(JwtAuthGuard)
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  /**
   * GET /catalogs/:nombre
   *
   * Endpoint genérico para obtener cualquier catálogo del sistema.
   * Valores válidos para :nombre:
   *   roles | empresas | sites | modulos | areas | tipos-contratacion | modalidades
   *
   * Ejemplos:
   *   GET /catalogs/roles
   *   GET /catalogs/empresas
   *   GET /catalogs/sites
   */
  @Get(':nombre')
  @ApiParam({
    name: 'nombre',
    description: 'Nombre del catálogo a consultar',
    enum: ['roles', 'empresas', 'sites', 'modulos', 'areas', 'tipos-contratacion', 'modalidades'],
  })
  @ApiOperation({
    summary: 'Obtener catálogo genérico',
    description:
      'Retorna los registros activos del catálogo indicado en el path param. ' +
      'Valores aceptados: roles, empresas, sites, modulos, areas, tipos-contratacion, modalidades.',
  })
  @ApiResponse({ status: 200, description: 'Lista de registros del catálogo.' })
  @ApiResponse({ status: 400, description: 'Catálogo no reconocido.' })
  getCatalog(@Param('nombre') nombre: string) {
    return this.catalogsService.getCatalog(nombre as CatalogKey);
  }
}
