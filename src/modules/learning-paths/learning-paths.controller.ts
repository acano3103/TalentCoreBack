import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CompanyTenantGuard } from '../auth/guards/company-tenant.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ActualizarRutaDto,
  CrearRutaDto,
  ListarRutasQuery,
  PaginacionQuery,
  AsignarRutaDto,
  ReemplazarVersionDto,
} from './dto/rutas.dto';
import { LearningPathsService } from './learning-paths.service';

@ApiTags('Rutas de aprendizaje')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard)
@Controller('companies/:companyId/learning-paths')
export class LearningPathsController {
  constructor(private readonly rutas: LearningPathsService) {}

  @Get('scope-options')
  @ApiOperation({
    summary: 'Catálogo del editor de alcance',
    description:
      'Unidades operativas, estados distintos de los sites, sites, puestos y áreas de la empresa.',
  })
  @ApiResponse({ status: 200, description: 'Catálogos de la empresa.' })
  opciones(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.rutas.opcionesAlcance(companyId);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar rutas',
    description:
      'Filtros por propósito, estado, site, puesto y búsqueda. Incluye los indicadores de la pantalla.',
  })
  @ApiResponse({ status: 200, description: 'Página de rutas y KPIs.' })
  @ApiResponse({ status: 401, description: SWAGGER_AUTH_DESCRIPTION })
  listar(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: ListarRutasQuery,
  ) {
    return this.rutas.listar(companyId, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear una ruta',
    description:
      'Crea la ruta con la versión 1 en borrador, sin etapas ni alcance.',
  })
  @ApiResponse({ status: 201, description: 'Ruta creada.' })
  crear(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CrearRutaDto,
  ) {
    return this.rutas.crear(user, companyId, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de una ruta',
    description:
      'Datos generales, versión publicada y borrador, con etapas, cursos y alcance.',
  })
  @ApiResponse({ status: 200, description: 'Ruta.' })
  @ApiResponse({ status: 404, description: 'No existe en la empresa.' })
  detalle(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rutas.detalle(companyId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar datos generales',
    description: 'Nombre, descripción, propósito y activo.',
  })
  @ApiResponse({ status: 200, description: 'Ruta actualizada.' })
  actualizar(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarRutaDto,
  ) {
    return this.rutas.actualizar(user, companyId, id, dto);
  }

  @Post(':id/draft')
  @ApiOperation({
    summary: 'Abrir un borrador',
    description: 'Copia la versión publicada. Si ya hay borrador, lo devuelve.',
  })
  @ApiResponse({ status: 201, description: 'Borrador de la ruta.' })
  borrador(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rutas.crearBorrador(companyId, id);
  }

  @Put(':id/versions/:versionId')
  @ApiOperation({
    summary: 'Reemplazar el borrador',
    description:
      'Sustituye etapas, cursos y alcance en una transacción. Solo acepta una versión en borrador.',
  })
  @ApiResponse({ status: 200, description: 'Borrador actualizado.' })
  @ApiResponse({
    status: 400,
    description:
      'Curso repetido, plazo inválido, prerrequisito o alcance fuera de la empresa.',
  })
  @ApiResponse({ status: 409, description: 'VERSION_NO_BORRADOR.' })
  reemplazar(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Body() dto: ReemplazarVersionDto,
  ) {
    return this.rutas.reemplazarVersion(companyId, id, versionId, dto);
  }

  @Get(':id/versions/:versionId/preview')
  @ApiOperation({
    summary: 'Vista previa de publicar',
    description:
      'Calcula el impacto y el diff contra la publicada. No escribe en la base.',
  })
  @ApiResponse({ status: 200, description: 'Impacto y diferencias.' })
  vistaPrevia(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ) {
    return this.rutas.vistaPrevia(companyId, id, versionId);
  }

  @Post(':id/versions/:versionId/publish')
  @ApiOperation({
    summary: 'Publicar el borrador',
    description:
      'Retira la versión publicada y llama al motor con disparador publicacion.',
  })
  @ApiResponse({ status: 201, description: 'Resumen de la publicación.' })
  @ApiResponse({ status: 400, description: 'RUTA_SIN_CURSOS.' })
  publicar(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ) {
    return this.rutas.publicar(user, companyId, id, versionId);
  }

  @Get(':id/versions')
  @ApiOperation({
    summary: 'Historial de versiones',
    description: 'Fecha, autor y personas asignadas por versión.',
  })
  @ApiResponse({ status: 200, description: 'Versiones de la ruta.' })
  versiones(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rutas.versiones(companyId, id);
  }

  @Get(':id/assignees')
  @ApiOperation({
    summary: 'Personas asignadas',
    description: 'Página con el avance de cada persona y su versión.',
  })
  @ApiResponse({ status: 200, description: 'Asignados de la ruta.' })
  asignados(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginacionQuery,
  ) {
    return this.rutas.asignados(companyId, id, query);
  }

  @Post(':id/assign')
  @ApiOperation({
    summary: 'Asignar la versión publicada',
    description:
      'RH elige empleados. El motor aplica la regla de versiones y no duplica inscripciones.',
  })
  @ApiResponse({ status: 201, description: 'Resumen de la asignación.' })
  @ApiResponse({ status: 409, description: 'SIN_VERSION_PUBLICADA.' })
  asignar(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarRutaDto,
  ) {
    return this.rutas.asignar(user, companyId, id, dto.idEmpleados);
  }

  @Post(':id/duplicate')
  @ApiOperation({
    summary: 'Duplicar la ruta',
    description: 'Crea otra ruta con la versión 1 en borrador.',
  })
  @ApiResponse({ status: 201, description: 'Copia creada.' })
  duplicar(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rutas.duplicar(user, companyId, id);
  }
}
