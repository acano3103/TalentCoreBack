import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Res, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CommsCapabilityGuard } from '../capabilities/comms-capability.guard';
import { CommsThrottlerGuard } from '../housekeeping/comms-throttler.guard';
import { EJEMPLO_ANALITICA, EJEMPLO_REENVIO } from '../housekeeping/ejemplos-swagger';
import { AnnouncementAnalyticsService } from './announcement-analytics.service';
import { DesgloseQuery, DestinatariosQuery, ReenviarDto, ResponderPreguntaDto } from './dto/analitica.dto';

/**
 * El autor entra aunque no tenga COM_VER_ANALITICA.
 * Quien no lo creó necesita esa capacidad y el alcance del listado.
 * El decorador de una sola capacidad no expresa ese «o», así que lo resuelve el servicio.
 */
@ApiTags('Comunicación interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard, CommsCapabilityGuard)
@Controller('companies/:companyId/comms')
export class AnnouncementAnalyticsController {
    constructor(
        private readonly service: AnnouncementAnalyticsService,
        private readonly excel: ExcelExportService,
    ) {}

    @Get('announcements/:id/analytics')
    @ApiOperation({
        summary: 'Analítica de un comunicado',
        description: 'KPIs, curva de las primeras 72 horas y entrega por canal. Sale de los destinatarios congelados y de los acuses.',
    })
    @ApiResponse({ status: 200, description: 'Indicadores del comunicado.', schema: { example: EJEMPLO_ANALITICA } })
    @ApiResponse({ status: 401, description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD.' })
    @ApiResponse({ status: 404, description: 'No existe o está fuera de tu alcance.' })
    analitica(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.analitica(activeUser, companyId, id);
    }

    @Get('announcements/:id/analytics/breakdown')
    @ApiOperation({
        summary: 'Desglose de la analítica',
        description: 'Agrupa por la ubicación, el área, el puesto, el tipo de personal o el jefe que quedaron congelados al enviar.',
    })
    @ApiResponse({ status: 200, description: 'Grupos con lectura, acuse y pendientes.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD.' })
    desglose(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Query() query: DesgloseQuery,
    ) {
        return this.service.desglose(activeUser, companyId, id, query);
    }

    @Get('announcements/:id/recipients/export')
    @ApiOperation({
        summary: 'Exportar evidencia de acuse',
        description: 'Excel con la fecha local, el canal, el método, la IP, el dispositivo y la versión de cada acuse.',
    })
    @ApiResponse({ status: 200, description: 'Archivo de Excel.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD.' })
    async exportar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Res() res: Response,
    ) {
        const buffer = await this.service.exportar(activeUser, companyId, id);
        this.excel.send(res, buffer, `Acuses_comunicado_${id}`);
    }

    @Get('announcements/:id/recipients')
    @ApiOperation({
        summary: 'Destinatarios de un comunicado',
        description: 'Colaborador, ubicación congelada, canales intentados, último intento y estado.',
    })
    @ApiResponse({ status: 200, description: 'Página de destinatarios.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD.' })
    destinatarios(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Query() query: DestinatariosQuery,
    ) {
        return this.service.destinatarios(activeUser, companyId, id, query);
    }

    @Post('announcements/:id/resend')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @UseGuards(CommsThrottlerGuard)
    @ApiOperation({
        summary: 'Reenviar a quien sigue pendiente',
        description: 'Encola de nuevo con los canales efectivos de ahora. Respeta el silencio y el tope de WhatsApp, y suma un recordatorio. Máximo 10 reenvíos por minuto.',
    })
    @ApiBody({ schema: { example: { alcance: 'PENDIENTES' } } })
    @ApiResponse({ status: 200, description: 'Personas reencoladas.', schema: { example: EJEMPLO_REENVIO } })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO.' })
    @ApiResponse({ status: 429, description: 'DEMASIADAS_SOLICITUDES.' })
    reenviar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ReenviarDto,
    ) {
        return this.service.reenviar(activeUser, companyId, id, dto);
    }

    @Get('announcements/:id/questions')
    @ApiOperation({ summary: 'Preguntas del comunicado', description: 'Las que enviaron los colaboradores desde su bandeja.' })
    @ApiResponse({ status: 200, description: 'Preguntas y respuestas.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD.' })
    preguntas(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.preguntas(activeUser, companyId, id);
    }

    @Post('announcements/:id/questions/:qid/answer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Responder una pregunta',
        description: 'Avisa al colaborador en la categoría COMUNICADO, con un enlace al comunicado.',
    })
    @ApiResponse({ status: 200, description: 'Respuesta guardada.' })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO.' })
    responder(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('qid', ParseIntPipe) qid: number,
        @Body() dto: ResponderPreguntaDto,
    ) {
        return this.service.responder(activeUser, companyId, id, qid, dto);
    }
}
