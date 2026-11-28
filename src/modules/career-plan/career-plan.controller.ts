import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Delete,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CareerPlanService } from './career-plan.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';
import {
  ListarColaboradoresQuery,
  MapaCarreraQuery,
  NominateDto,
  UpdateRouteDto,
} from './dto/career-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('Career Plan')
@Controller('companies/:companyId/career-plan')
export class CareerPlanController {
  constructor(private readonly careerPlanService: CareerPlanService) {}

  @Get('map')
  @ApiOperation({
    summary: 'Mapa de puestos y caminos de carrera',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'Nodos y caminos del mapa' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  findMap(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: MapaCarreraQuery,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.careerPlanService.findMap(companyId, query.idArea, activeUser);
  }

  // Endpoint para obtener las rutas de crecimiento activas de una empresa
  @Get('routes')
  @ApiOperation({
    summary: 'Get all career routes for a company',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'List of career routes' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  findRoutes(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.careerPlanService.findRoutes(companyId);
  }

  // Endpoint para crear una ruta de crecimiento (puesto origen -> puesto destino)
  @Post('routes')
  @ApiOperation({
    summary: 'Create a career route',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'Route created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid route' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  createRoute(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createRouteDto: CreateRouteDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.careerPlanService.createRoute(
      companyId,
      createRouteDto,
      activeUser,
    );
  }

  @Patch('routes/:routeId')
  @ApiOperation({
    summary: 'Update seniority and learning path of a career route',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'Route updated successfully' })
  @ApiResponse({ status: 404, description: 'Route not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  updateRoute(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('routeId', ParseIntPipe) routeId: number,
    @Body() dto: UpdateRouteDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.careerPlanService.updateRoute(
      companyId,
      routeId,
      dto,
      activeUser,
    );
  }

  // Endpoint para desactivar una ruta de crecimiento (soft delete)
  @Delete('routes/:routeId')
  @ApiOperation({
    summary: 'Disable a career route',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'Route disabled successfully' })
  @ApiResponse({ status: 404, description: 'Route not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  disableRoute(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('routeId', ParseIntPipe) routeId: number,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.careerPlanService.disableRoute(companyId, routeId, activeUser);
  }

  // Endpoint para obtener la malla de cursos Plan de Carrera del puesto destino de una ruta
  @Get('routes/:routeId/courses')
  @ApiOperation({
    summary: 'Get career plan courses for a route target position',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'List of courses of the route' })
  @ApiResponse({ status: 404, description: 'Route not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  findRouteCourses(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('routeId', ParseIntPipe) routeId: number,
  ) {
    return this.careerPlanService.findRouteCourses(companyId, routeId);
  }

  // Endpoint para obtener las postulaciones de colaboradores a rutas, con % de avance
  @Get('colaboradores')
  @ApiOperation({
    summary: 'Get all career plan postulations with progress',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({
    status: 200,
    description: 'List of postulations with progress',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  findColaboradores(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.careerPlanService.findColaboradores(companyId);
  }

  // Endpoint para postular a un colaborador a una ruta
  @Post('colaboradores')
  @ApiOperation({
    summary: 'Postulate a collaborator to a career route',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'Postulation created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid postulation' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  createPostulacion(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createPostulacionDto: CreatePostulacionDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.careerPlanService.createPostulacion(
      companyId,
      createPostulacionDto,
      activeUser,
    );
  }

  @Get('colaboradores/kpis')
  @ApiOperation({
    summary: 'KPIs del plan de carrera',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'Indicadores de los colaboradores' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  kpisColaboradores(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: ListarColaboradoresQuery,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.careerPlanService.kpisColaboradores(
      companyId,
      query,
      activeUser,
    );
  }

  @Post('colaboradores/:planId/nominate')
  @ApiOperation({
    summary: 'Nominate a collaborator who is ready for promotion',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'Nomination created' })
  @ApiResponse({ status: 403, description: 'Not allowed to nominate' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  nominate(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: NominateDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.careerPlanService.nominate(companyId, planId, dto, activeUser);
  }

  // Endpoint para obtener el detalle de una postulacion (tabla curso por curso)
  @Get('colaboradores/:planId')
  @ApiOperation({
    summary: 'Get postulation detail with per-course breakdown',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'Postulation detail' })
  @ApiResponse({ status: 404, description: 'Postulation not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  findColaborador(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('planId', ParseIntPipe) planId: number,
  ) {
    return this.careerPlanService.findColaborador(companyId, planId);
  }
}
