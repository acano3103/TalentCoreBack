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

  @Post(':id/activation-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerar el código de activación',
    description: 'Invalida los códigos vigentes y entrega uno nuevo, una sola vez. Solo si el kiosco está pendiente de activación o bloqueado.',
  })
  @ApiParam({ name: 'companyId', description: 'Identificador de la empresa', type: Number })
  @ApiParam({ name: 'id', description: 'Identificador del kiosco', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Código regenerado. Se muestra una sola vez.',
    schema: {
      example: {
        codigo: '7A92F4B18C23D5E6A1B09C4D8F2E6A10',
        expiraEn: '2026-11-12T20:00:00.000Z',
        vigenciaHoras: 24,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Usuario no autenticado o sin tenant.' })
  @ApiResponse({ status: 404, description: 'Kiosco no encontrado en la empresa.' })
  @ApiResponse({ status: 409, description: 'El kiosco está activo o dado de baja.' })
  regenerateActivationCode(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.kiosksService.regenerateActivationCode(activeUser, companyId, id);
  }

  @Patch(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bloquear un kiosco',
    description: 'Pasa el kiosco a BLOQUEADO y anula su token.',
  })
  @ApiParam({ name: 'companyId', description: 'Identificador de la empresa', type: Number })
  @ApiParam({ name: 'id', description: 'Identificador del kiosco', type: Number })
  @ApiResponse({ status: 200, description: 'Kiosco bloqueado correctamente.' })
  @ApiResponse({ status: 401, description: 'Usuario no autenticado o sin tenant.' })
  @ApiResponse({ status: 404, description: 'Kiosco no encontrado en la empresa.' })
  @ApiResponse({ status: 409, description: 'El kiosco está dado de baja.' })
  block(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.kiosksService.blockKiosk(activeUser, companyId, id);
  }

  @Patch(':id/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desbloquear un kiosco',
    description: 'Regresa el kiosco a pendiente de activación y desvincula el equipo. Hay que activarlo de nuevo.',
  })
  @ApiParam({ name: 'companyId', description: 'Identificador de la empresa', type: Number })
  @ApiParam({ name: 'id', description: 'Identificador del kiosco', type: Number })
  @ApiResponse({ status: 200, description: 'Kiosco desbloqueado. Requiere una activación nueva.' })
  @ApiResponse({ status: 401, description: 'Usuario no autenticado o sin tenant.' })
  @ApiResponse({ status: 404, description: 'Kiosco no encontrado en la empresa.' })
  @ApiResponse({ status: 409, description: 'El kiosco no está bloqueado.' })
  unblock(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.kiosksService.unblockKiosk(activeUser, companyId, id);
  }

  @Patch(':id/retire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dar de baja un kiosco',
    description: 'Marca el kiosco como BAJA, registra la fecha y anula su token. La baja es irreversible.',
  })
  @ApiParam({ name: 'companyId', description: 'Identificador de la empresa', type: Number })
  @ApiParam({ name: 'id', description: 'Identificador del kiosco', type: Number })
  @ApiResponse({ status: 200, description: 'Kiosco dado de baja correctamente.' })
  @ApiResponse({ status: 401, description: 'Usuario no autenticado o sin tenant.' })
  @ApiResponse({ status: 404, description: 'Kiosco no encontrado en la empresa.' })
  @ApiResponse({ status: 409, description: 'El kiosco ya está dado de baja.' })
  retire(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.kiosksService.retireKiosk(activeUser, companyId, id);
  }
}
