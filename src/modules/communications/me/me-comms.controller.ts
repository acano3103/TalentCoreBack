import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { contextoCliente, SolicitudCliente } from './cliente-http';
import { BandejaCommsQuery, PreguntaComunicadoDto } from './dto/me-comms.dto';
import { MeCommsService } from './me-comms.service';

@ApiTags('Comunicación interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard)
@Controller('companies/:companyId/me/comms')
export class MeCommsController {
    constructor(private readonly service: MeCommsService) {}

    @Get('pending-modal')
    @ApiOperation({ summary: 'Comunicados que deben mostrarse en modal', description: 'Omite los que la persona pospuso hoy.' })
    @ApiResponse({ status: 200, description: 'Hasta 10 comunicados vigentes.' })
    @ApiResponse({ status: 401, description: SWAGGER_AUTH_DESCRIPTION })
    modal(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.service.modalPendiente(activeUser, companyId);
    }

    @Get()
    @ApiOperation({
        summary: 'Mis comunicados',
        description: 'Pendientes son los que piden acuse, siguen vigentes y aún no se confirman.',
    })
    @ApiResponse({ status: 200, description: 'Página de la bandeja.' })
    listar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: BandejaCommsQuery,
    ) {
        return this.service.listar(activeUser, companyId, query);
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Leer un comunicado',
        description: 'Marca la lectura y, si el acuse es al leer, confirma la versión vigente.',
    })
    @ApiResponse({ status: 200, description: 'Detalle con cuerpo HTML y texto.' })
    @ApiResponse({ status: 404, description: 'NO_DESTINATARIO.' })
    detalle(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Req() req: SolicitudCliente,
    ) {
        return this.service.detalle(activeUser, companyId, id, contextoCliente(req));
    }

    @Post(':id/acknowledge')
    @HttpCode(HttpStatus.OK)
    @ApiHeader({ name: 'X-Client', required: false, description: 'mobile registra el canal APP. Si no viene, el canal es WEB.' })
    @ApiOperation({ summary: 'Confirmar de enterado', description: 'Es idempotente para la versión vigente.' })
    @ApiResponse({ status: 200, description: 'confirmadoEn, version y canal.' })
    @ApiResponse({ status: 409, description: 'ACUSE_NO_REQUERIDO o ESTADO_INVALIDO.' })
    acusar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Req() req: SolicitudCliente,
    ) {
        return this.service.acusar(activeUser, companyId, id, contextoCliente(req));
    }

    @Post(':id/questions')
    @ApiOperation({ summary: 'Preguntar sobre el comunicado', description: 'Solo si lo permite. Máximo 3 preguntas y 1000 caracteres.' })
    @ApiResponse({ status: 201, description: 'Pregunta registrada.' })
    @ApiResponse({ status: 400, description: 'CONTENIDO_INVALIDO.' })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO.' })
    preguntar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: PreguntaComunicadoDto,
    ) {
        return this.service.preguntar(activeUser, companyId, id, dto.pregunta);
    }

    @Post(':id/snooze')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Ocultar el modal por hoy', description: 'El snooze dura el día local de la ubicación del empleado.' })
    @ApiResponse({ status: 200, description: 'Día en que permanece oculto.' })
    posponer(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.posponer(activeUser, companyId, id);
    }
}
