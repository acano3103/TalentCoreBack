import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { MobileJwtAuthGuard } from 'src/modules/mobile/mobile-auth/guards/mobile-jwt-auth.guard';
import { contextoCliente, SolicitudCliente } from './cliente-http';
import { BandejaCommsQuery, PreguntaComunicadoDto } from './dto/me-comms.dto';
import { MeCommsService } from './me-comms.service';

@ApiTags('Mobile Comms')
@ApiBearerAuth()
@UseGuards(MobileJwtAuthGuard, CompanyTenantGuard)
@Controller('mobile/companies/:companyId/comms')
export class MobileCommsController {
    constructor(private readonly service: MeCommsService) {}

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
    posponer(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.posponer(activeUser, companyId, id);
    }
}
