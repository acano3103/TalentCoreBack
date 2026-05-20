import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CatalogosService } from './catalogos.service';

@ApiTags('Catalogos')
@Controller('catalogos')
export class CatalogosController {
    constructor(private readonly catalogosService: CatalogosService) { }

    @Get('roles')
    @ApiOperation({
        summary: 'Obtener catálogo de roles',
        description: 'Retorna todos los roles activos del sistema (tabla catroles).',
    })
    @ApiResponse({ status: 200, description: 'Lista de roles obtenida correctamente.' })
    findAllRoles() {
        return this.catalogosService.findAllRoles();
    }
}
