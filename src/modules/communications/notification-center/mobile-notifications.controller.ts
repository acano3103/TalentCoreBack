import {
  Body,
  Controller,
  Delete,
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
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { MobileJwtAuthGuard } from 'src/modules/mobile/mobile-auth/guards/mobile-jwt-auth.guard';
import {
  GuardarPreferenciasDto,
  LeerTodasQuery,
  ListarNotificacionesQuery,
  RegistrarPushTokenDto,
} from './dto/notificaciones.dto';
import { NotificationCenterService } from './notification-center.service';

@ApiTags('Mobile Centro de notificaciones')
@ApiBearerAuth()
@UseGuards(MobileJwtAuthGuard, CompanyTenantGuard)
@Controller('mobile/companies/:companyId/me')
export class MobileNotificationsController {
  constructor(private readonly service: NotificationCenterService) {}

  @Get('notifications/count')
  @ApiOperation({ summary: 'Conteo de la campana en la app' })
  @ApiResponse({ status: 200, description: 'total y porCategoria.' })
  conteo(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.service.conteo(activeUser, companyId);
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'Centro de notificaciones en la app',
    description:
      'Misma agrupación que la web. categoria filtra COMUNICADO, AVISO, RECORDATORIO, APROBACION o SISTEMA. destino.tipo incluye MIS_CLASES (id = idFechaClase), MI_CURSO (id = idSesion), MI_RUTA y MI_PLAN_CARRERA. El push repite ese destino en data.destino.',
  })
  @ApiResponse({ status: 200, description: 'Página de grupos.' })
  listar(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: ListarNotificacionesQuery,
  ) {
    return this.service.listar(activeUser, companyId, query);
  }

  @Patch('notifications/read-all')
  @ApiOperation({ summary: 'Marcar todas como leídas en la app' })
  @ApiResponse({ status: 200, description: 'Cantidad actualizada.' })
  leerTodas(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: LeerTodasQuery,
  ) {
    return this.service.marcarTodas(activeUser, companyId, query.category);
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Marcar una notificación como leída en la app' })
  @ApiResponse({ status: 200, description: 'leidaEn.' })
  leerUna(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id') id: string,
  ) {
    return this.service.marcarLeida(activeUser, companyId, id);
  }

  @Get('notification-preferences')
  @ApiOperation({
    summary: 'Preferencias de la app',
    description:
      'bloqueada: true se muestra como Siempre. CELEBRACION va en fase 2. informativas no se edita.',
  })
  @ApiResponse({ status: 200, description: 'Categoría por canal.' })
  preferencias(@GetActiveUser() activeUser: ActiveUserDto) {
    return this.service.preferencias(activeUser);
  }

  @Put('notification-preferences')
  @ApiOperation({ summary: 'Guardar preferencias desde la app' })
  @ApiResponse({ status: 400, description: 'PREFERENCIA_BLOQUEADA.' })
  guardarPreferencias(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Body() dto: GuardarPreferenciasDto,
  ) {
    return this.service.guardarPreferencias(activeUser, dto);
  }

  @Post('push-tokens')
  @ApiOperation({
    summary: 'Registrar el token de este teléfono',
    description: 'Reasigna el token si cambió de persona.',
  })
  @ApiResponse({ status: 201, description: 'Dispositivo activo.' })
  registrarToken(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: RegistrarPushTokenDto,
  ) {
    return this.service.registrarToken(activeUser, companyId, dto);
  }

  @Delete('push-tokens/:token')
  @ApiOperation({ summary: 'Dar de baja el token de este teléfono' })
  @ApiResponse({ status: 200, description: 'activo: false.' })
  bajaToken(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('token') token: string,
  ) {
    return this.service.bajaToken(activeUser, token);
  }

  @Get('push-devices')
  @ApiOperation({ summary: 'Teléfonos con push de la persona' })
  @ApiResponse({ status: 200, description: 'Lista de dispositivos.' })
  dispositivos(@GetActiveUser() activeUser: ActiveUserDto) {
    return this.service.dispositivos(activeUser);
  }
}
