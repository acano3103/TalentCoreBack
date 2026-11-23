import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { contextoCliente } from 'src/modules/communications/me/cliente-http';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { RangoClasesQuery } from './dto/rango-clases.query';
import { RegistrarAsistenciaQrDto } from './dto/registrar-asistencia-qr.dto';
import { MobileTrainingService } from './mobile-training.service';

@ApiTags('Mobile Training')
@ApiBearerAuth()
@UseGuards(MobileJwtAuthGuard, CompanyTenantGuard)
@Controller('mobile/companies/:companyId/training/classes')
export class MobileClassesController {
    constructor(private readonly training: MobileTrainingService) {}

    @Get()
    @ApiOperation({
        summary: 'Clases presenciales y síncronas del empleado',
        description:
            'Solo sesiones donde está inscrito. desde y hasta son ISO; si faltan, el rango va de hoy menos 30 días a hoy más 60 días, en la zona de la empresa. El número de clase ignora las canceladas.',
    })
    @ApiResponse({ status: 200, description: 'ClaseResumen[] ordenadas por fechaHoraInicio.' })
    @ApiResponse({ status: 400, description: 'El rango de fechas no es válido.' })
    @ApiResponse({ status: 403, description: 'La empresa no pertenece al tenant del token.' })
    @ApiResponse({ status: 404, description: 'El usuario no tiene empleado en esta empresa.' })
    listar(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: RangoClasesQuery,
        @GetActiveUser() user: ActiveUserDto,
    ) {
        return this.training.listarClases(companyId, user, query.desde, query.hasta);
    }

    @Post('attendance')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Registrar asistencia con el QR de la clase',
        description:
            'El código es la URL pública o el classId cifrado. La asistencia queda a nombre del empleado del token, con método app_movil. Si ya estaba registrada, responde 200 sin cambiar la hora ni la gamificación. Si es nueva, la respuesta incluye la gamificación ganada.',
    })
    @ApiResponse({ status: 200, description: 'Asistencia registrada o ya existente (duplicada: true).' })
    @ApiResponse({ status: 403, description: 'NO_INSCRITO. No está inscrito en el curso.' })
    @ApiResponse({ status: 404, description: 'QR_NO_VALIDO. El código no corresponde a una clase de la empresa.' })
    @ApiResponse({ status: 409, description: 'CLASE_CANCELADA o FUERA_DE_VENTANA. Fuera de ventana incluye ventana.' })
    registrar(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: RegistrarAsistenciaQrDto,
        @GetActiveUser() user: ActiveUserDto,
        @Req() req: Request,
    ) {
        return this.training.registrarAsistenciaQr(companyId, dto.codigo, contextoCliente(req).ip, user);
    }
}
