import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { KiosksService } from './kiosks.service';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateKioskDto } from './dto/create-kiosk.dto';
import { QueryKiosksDto } from './dto/query-kiosks.dto';
import { UpdateKioskDto } from './dto/update-kiosk.dto';

@ApiTags('Kiosks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/kiosks')
export class KiosksController {
  constructor(private readonly kiosksService: KiosksService) { }

  // Obtener kioscos paginados.
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener kioscos de asistencia',
    description: 'Obtiene los kioscos de una empresa con paginación, búsqueda por responsable o código y filtros por estatus, modalidad, ubicación y alertas. Cada elemento incluye conexion, versionApp y pendientesReportados.',
  })
  @ApiParam({ name: 'companyId', description: 'Identificador de la empresa', type: Number })
  @ApiResponse({ status: 200, description: 'Kioscos obtenidos correctamente.' })
  @ApiResponse({ status: 401, description: 'Usuario no autenticado o sin tenant.' })
  findAll(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: QueryKiosksDto,
  ) {
    return this.kiosksService.findAll(activeUser, companyId, query);
  }

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resumen de kioscos',
    description: 'Totales de la empresa: kioscos, conexión, activación pendiente, checadas de hoy y registros por revisar.',
  })
  @ApiParam({ name: 'companyId', description: 'Identificador de la empresa', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Resumen obtenido correctamente.',
    schema: {
      example: {
        total: 4,
        activos: 2,
        enLinea: 1,
        sinConexion: 1,
        pendientesActivacion: 1,
        checadasHoy: 12,
        porRevisar: 3,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Usuario no autenticado o sin tenant.' })
  summary(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.kiosksService.getSummary(activeUser, companyId);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detalle de un kiosco',
    description: 'Devuelve el mismo elemento del listado más políticas, activación, equipo y conexión.',
  })
  @ApiParam({ name: 'companyId', description: 'Identificador de la empresa', type: Number })
  @ApiParam({ name: 'id', description: 'Identificador del kiosco', type: Number })
  @ApiResponse({ status: 200, description: 'Kiosco obtenido correctamente.' })
  @ApiResponse({ status: 401, description: 'Usuario no autenticado o sin tenant.' })
  @ApiResponse({ status: 404, description: 'Kiosco no encontrado en la empresa.' })
  findOne(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.kiosksService.findOne(activeUser, companyId, id);
  }

  // Crea un nuevo kiosco de asistencia
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un kiosco de asistencia', description: 'Crea un kiosco de asistencia en modalidad FIJO o CUADRILLA.' })
  @ApiParam({ name: 'companyId', description: 'Identificador de la empresa', type: Number, example: 3 })
  @ApiBody({ type: CreateKioskDto })
  @ApiResponse({ status: 201, description: 'Kiosco creado correctamente.' })
  @ApiResponse({ status: 400, description: 'Configuración inválida o ubicaciones incorrectas.' })
  @ApiResponse({ status: 401, description: 'Usuario no autenticado o sin tenant.' })
  @ApiResponse({ status: 404, description: 'Empleado responsable no encontrado.' })
  @ApiResponse({ status: 409, description: 'Conflicto con un registro único.' })
  @ApiResponse({ status: 500, description: 'Error interno al crear el kiosco.' })
  create(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateKioskDto,
  ) {
    return this.kiosksService.createKiosk(activeUser, companyId, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualizar un kiosco',
    description: 'Cambia nombre, responsable, ubicaciones de un kiosco fijo y políticas. La modalidad no se puede cambiar.',
  })
  @ApiParam({ name: 'companyId', description: 'Identificador de la empresa', type: Number })
  @ApiParam({ name: 'id', description: 'Identificador del kiosco', type: Number })
  @ApiBody({ type: UpdateKioskDto })
  @ApiResponse({ status: 200, description: 'Kiosco actualizado correctamente.' })
  @ApiResponse({ status: 400, description: 'Configuración inválida o cambio de modalidad.' })
  @ApiResponse({ status: 401, description: 'Usuario no autenticado o sin tenant.' })
  @ApiResponse({ status: 404, description: 'Kiosco o responsable no encontrado.' })
  @ApiResponse({ status: 409, description: 'El kiosco está dado de baja.' })
  update(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKioskDto,
  ) {
    return this.kiosksService.updateKiosk(activeUser, companyId, id, dto);
  }

  // Regenerar código de activación.
  @Post(':idKiosco/regenerate-activation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerar código de activación', description: 'Genera un nuevo código de activación e invalida los códigos anteriores que no hayan sido utilizados.' })
  @ApiParam({ name: 'companyId', type: Number })
  @ApiParam({ name: 'idKiosco', type: Number })
  @ApiResponse({ status: 200, description: 'Código de activación regenerado correctamente.' })
  @ApiResponse({ status: 404, description: 'Kiosco no encontrado.' })
  @ApiResponse({ status: 409, description: 'No se puede regenerar el código de un kiosco bloqueado o dado de baja.' })
  regenerateActivation(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idKiosco', ParseIntPipe) idKiosco: number,
  ) {
    return this.kiosksService.regenerateActivationCode(activeUser, companyId, idKiosco);
  }

  // Bloquear kiosco.
  @Patch(':idKiosco/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bloquear un kiosco', description: 'Bloquea el kiosco para impedir que continúe registrando asistencias.' })
  @ApiParam({ name: 'companyId', type: Number })
  @ApiParam({ name: 'idKiosco', type: Number })
  @ApiResponse({ status: 200, description: 'Kiosco bloqueado correctamente.' })
  @ApiResponse({ status: 404, description: 'Kiosco no encontrado.' })
  @ApiResponse({ status: 409, description: 'El kiosco ya está bloqueado o dado de baja.' })
  block(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idKiosco', ParseIntPipe) idKiosco: number,
  ) {
    return this.kiosksService.blockKiosk(activeUser, companyId, idKiosco);
  }

  // Dar de baja kiosco.
  @Patch(':idKiosco/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dar de baja un kiosco', description: 'Da de baja definitivamente el kiosco, invalida códigos pendientes y desvincula el dispositivo.' })
  @ApiParam({ name: 'companyId', type: Number })
  @ApiParam({ name: 'idKiosco', type: Number })
  @ApiResponse({ status: 200, description: 'Kiosco dado de baja correctamente.' })
  @ApiResponse({ status: 404, description: 'Kiosco no encontrado.' })
  deactivate(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idKiosco', ParseIntPipe) idKiosco: number,
  ) {
    return this.kiosksService.deactivateKiosk(activeUser, companyId, idKiosco);
  }

  // Desbloquear kiosco.
  @Patch(':idKiosco/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desbloquear un kiosco', description: 'Restaura el estatus que tenía el kiosco antes de bloquearlo.' })
  unblock(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idKiosco', ParseIntPipe) idKiosco: number,
  ) {
    return this.kiosksService.unblockKiosk(activeUser, companyId, idKiosco);
  }

  // Reactivar kiosco dado de baja.
  @Patch(':idKiosco/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar un kiosco dado de baja', description: 'Reactiva el kiosco, genera un nuevo código de activación y requiere vincular nuevamente el dispositivo.' })
  reactivate(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idKiosco', ParseIntPipe) idKiosco: number,
  ) {
    return this.kiosksService.reactivateKiosk(activeUser, companyId, idKiosco);
  }

}
