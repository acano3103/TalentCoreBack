import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { MobileJwtAuthGuard } from 'src/modules/mobile/mobile-auth/guards/mobile-jwt-auth.guard';
import { contextoCliente, SolicitudCliente } from './cliente-http';
import { BandejaCommsQuery, PreguntaComunicadoDto } from './dto/me-comms.dto';
import { CrearAvisoEquipoDto, VistaEquipoQuery } from './dto/team-notice.dto';
import { MeCommsService } from './me-comms.service';
import { TeamNoticeService } from './team-notice.service';

@ApiTags('Mobile Comms')
@ApiBearerAuth()
@UseGuards(MobileJwtAuthGuard, CompanyTenantGuard)
@Controller('mobile/companies/:companyId/comms')
export class MobileCommsController {
    constructor(
        private readonly service: MeCommsService,
        private readonly avisos: TeamNoticeService,
    ) {}

    @Get('team-notice/preview')
    @ApiOperation({
        summary: 'Vista previa del aviso a mi equipo',
        description: 'Cuenta el equipo directo del jefe. whatsappSinApp=true suma WhatsApp a quien no tiene la app.',
    })
    @ApiResponse({ status: 200, description: 'total, conApp, soloWeb, porWhatsApp, sinCanal y costoWhatsAppEstimado.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD o TIPO_NO_PERMITIDO.' })
    vistaEquipo(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: VistaEquipoQuery,
    ) {
        return this.avisos.vistaPrevia(activeUser, companyId, query.whatsappSinApp === 'true');
    }

    @Get('team-notice')
    @ApiOperation({ summary: 'Avisos que envié a mi equipo', description: 'Los últimos 20, con leídos y acuses sobre el total.' })
    @ApiResponse({ status: 200, description: 'items con id, titulo, enviadoEn, leidos, total y acuses.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD o TIPO_NO_PERMITIDO.' })
    misAvisos(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.avisos.listar(activeUser, companyId);
    }

    @Post('team-notice')
    @ApiOperation({
        summary: 'Enviar un aviso a mi equipo',
        description: 'Crea un AVISO_EQUIPO de prioridad normal y lo envía. Sin plantilla de WhatsApp aprobada, ignora whatsappSinApp.',
    })
    @ApiResponse({ status: 201, description: 'id, totalDestinatarios y whatsapp.enviados. whatsapp.motivoOmitido si no se usó ese canal.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD o TIPO_NO_PERMITIDO.' })
    @ApiResponse({ status: 429, description: 'LIMITE_AVISOS: máximo 10 avisos por jefe al día.' })
    crearAviso(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: CrearAvisoEquipoDto,
    ) {
        return this.avisos.crear(activeUser, companyId, dto);
    }

    @Get('pending-modal')
    @ApiOperation({ summary: 'Modal de comunicados en la app', description: 'Misma regla que la web. El acuse queda en el canal APP.' })
    @ApiResponse({ status: 200, description: 'Comunicados vigentes sin posponer hoy.' })
    modal(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.service.modalPendiente(activeUser, companyId);
    }

    @Get()
    @ApiOperation({ summary: 'Bandeja móvil', description: 'Sin el cuerpo. El detalle devuelve cuerpoHtml y cuerpoTexto.' })
    @ApiResponse({ status: 200, description: 'Página de la bandeja.' })
    listar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: BandejaCommsQuery,
    ) {
        return this.service.listar(activeUser, companyId, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Leer un comunicado en la app', description: 'Devuelve cuerpoHtml y cuerpoTexto. Si el acuse es al leer, lo confirma.' })
    @ApiResponse({ status: 200, description: 'Detalle ligero.' })
    detalle(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Req() req: SolicitudCliente,
    ) {
        return this.service.detalle(activeUser, companyId, id, contextoCliente(req, true));
    }

    @Post(':id/acknowledge')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Confirmar de enterado en la app', description: 'Canal APP y método SESION. Idempotente por versión.' })
    @ApiResponse({ status: 200, description: 'confirmadoEn, version y canal.' })
    acusar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Req() req: SolicitudCliente,
    ) {
        return this.service.acusar(activeUser, companyId, id, contextoCliente(req, true));
    }

    @Get(':id/questions')
    @ApiOperation({ summary: 'Mis preguntas del comunicado', description: 'Las mismas que en la web: estado enviada o respondida, y el texto de la respuesta.' })
    @ApiResponse({ status: 200, description: 'Preguntas del empleado.' })
    @ApiResponse({ status: 404, description: 'NO_DESTINATARIO.' })
    misPreguntas(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.misPreguntas(activeUser, companyId, id);
    }

    @Post(':id/questions')
    @ApiOperation({ summary: 'Preguntar desde la app', description: 'Máximo 3 preguntas de 1000 caracteres.' })
    @ApiResponse({ status: 201, description: 'Pregunta registrada.' })
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
    @ApiOperation({ summary: 'Posponer el modal en la app', description: 'Queda oculto el resto del día local.' })
    @ApiResponse({ status: 200, description: 'Día en que permanece oculto.' })
    @ApiResponse({ status: 503, description: 'COLA_NO_DISPONIBLE: no se pudo guardar el snooze.' })
    posponer(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.posponer(activeUser, companyId, id);
    }
}
