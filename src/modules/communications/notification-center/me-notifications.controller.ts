import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GuardarPreferenciasDto, LeerTodasQuery, ListarNotificacionesQuery, RegistrarPushTokenDto } from './dto/notificaciones.dto';
import { NotificationCenterService } from './notification-center.service';

@ApiTags('Centro de notificaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard)
@Controller('companies/:companyId/me')
export class MeNotificationsController {
    constructor(private readonly service: NotificationCenterService) {}

    @Get('notifications/count')
    @ApiOperation({ summary: 'Conteo de la campana', description: 'Total de no leídas y desglose por categoría.' })
    @ApiResponse({ status: 200, description: 'total y porCategoria.' })
    @ApiResponse({ status: 401, description: SWAGGER_AUTH_DESCRIPTION })
    conteo(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.service.conteo(activeUser, companyId);
    }

    @Get('notifications')
    @ApiOperation({
        summary: 'Centro de notificaciones',
        description: 'Agrupa por Hoy, Esta semana y Anteriores en la zona de la ubicación. categoria filtra COMUNICADO, AVISO, RECORDATORIO, APROBACION o SISTEMA.',
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
    @ApiOperation({ summary: 'Marcar todas como leídas', description: 'No borra las notificaciones. category limita el alcance.' })
    @ApiResponse({ status: 200, description: 'Cantidad actualizada.' })
    leerTodas(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: LeerTodasQuery,
    ) {
        return this.service.marcarTodas(activeUser, companyId, query.category);
    }

    @Patch('notifications/:id/read')
    @ApiOperation({ summary: 'Marcar una notificación como leída', description: 'Solo escribe read_at. La fila se conserva.' })
    @ApiResponse({ status: 200, description: 'leidaEn.' })
    @ApiResponse({ status: 404, description: 'NOTIFICACION_NO_ENCONTRADA.' })
    leerUna(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id') id: string,
    ) {
        return this.service.marcarLeida(activeUser, companyId, id);
    }

    @Get('notification-preferences')
    @ApiOperation({
        summary: 'Matriz de preferencias',
        description: 'bloqueada: true se muestra como Siempre. CELEBRACION va en fase 2 y no se edita. informativas lista avisos que no se pueden apagar.',
    })
    @ApiResponse({ status: 200, description: 'Categoría por canal, más filas informativas.' })
    preferencias(@GetActiveUser() activeUser: ActiveUserDto) {
        return this.service.preferencias(activeUser);
    }

    @Put('notification-preferences')
    @ApiOperation({ summary: 'Guardar preferencias', description: 'Apagar una celda bloqueada responde PREFERENCIA_BLOQUEADA.' })
    @ApiResponse({ status: 200, description: 'Matriz actualizada.' })
    @ApiResponse({ status: 400, description: 'PREFERENCIA_BLOQUEADA.' })
    guardarPreferencias(@GetActiveUser() activeUser: ActiveUserDto, @Body() dto: GuardarPreferenciasDto) {
        return this.service.guardarPreferencias(activeUser, dto);
    }

    @Post('push-tokens')
    @ApiOperation({ summary: 'Registrar token push', description: 'Si el token ya existía, se reasigna a la persona autenticada.' })
    @ApiResponse({ status: 201, description: 'Dispositivo activo.' })
    registrarToken(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: RegistrarPushTokenDto,
    ) {
        return this.service.registrarToken(activeUser, companyId, dto);
    }

    @Delete('push-tokens/:token')
    @ApiOperation({ summary: 'Dar de baja un token push', description: 'El token va codificado en la ruta. No se borra la fila: queda inactivo.' })
    @ApiResponse({ status: 200, description: 'activo: false.' })
    @ApiResponse({ status: 404, description: 'DISPOSITIVO_NO_ENCONTRADO.' })
    bajaToken(@GetActiveUser() activeUser: ActiveUserDto, @Param('token') token: string) {
        return this.service.bajaToken(activeUser, token);
    }

    @Get('push-devices')
    @ApiOperation({ summary: 'Dispositivos con push', description: 'Solo los tokens activos de la persona autenticada.' })
    @ApiResponse({ status: 200, description: 'Lista de dispositivos.' })
    dispositivos(@GetActiveUser() activeUser: ActiveUserDto) {
        return this.service.dispositivos(activeUser);
    }
}
