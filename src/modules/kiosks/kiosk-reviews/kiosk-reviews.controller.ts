import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetActiveUser } from '../../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../../auth/dto/active-user.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
    ApproveIncidenciaDto,
    BulkValidateRegistrosDto,
    CorrectIncidenciaDto,
    RejectIncidenciaDto,
    RejectRegistroDto,
    ReassignRegistroDto,
    ValidateRegistroDto,
} from './dto/kiosk-review-actions.dto';
import { QueryKioskReviewCountsDto, QueryKioskReviewsDto } from './dto/query-kiosk-reviews.dto';
import { KioskReviewsService } from './kiosk-reviews.service';

@ApiTags('Kiosks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/kiosks/reviews')
export class KioskReviewsController {
    constructor(private readonly reviews: KioskReviewsService) {}

    @Get('counts')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Conteos de la bandeja de revisión',
        description: 'Registros de kiosco pendientes de revisión e incidencias PENDIENTE, agrupadas por tipo, en el rango indicado.',
    })
    @ApiParam({ name: 'companyId', type: Number })
    @ApiResponse({ status: 200, description: 'Conteos obtenidos.' })
    counts(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: QueryKioskReviewCountsDto,
    ) {
        return this.reviews.counts(user, companyId, query);
    }

    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Bandeja de revisión del kiosco',
        description: 'Lista registros con requiereRevision o incidencias pendientes. La hora va en la zona del site.',
    })
    @ApiParam({ name: 'companyId', type: Number })
    @ApiResponse({ status: 200, description: 'Bandeja obtenida.' })
    list(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: QueryKioskReviewsDto,
    ) {
        return this.reviews.list(user, companyId, query);
    }

    @Post('registros/bulk-validate')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Validar varios registros',
        description: 'Hasta 100 registros. Cada identificador trae su propio resultado.',
    })
    @ApiParam({ name: 'companyId', type: Number })
    @ApiBody({ type: BulkValidateRegistrosDto })
    @ApiResponse({ status: 200, description: 'Resultado por registro.' })
    bulkValidate(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: BulkValidateRegistrosDto,
    ) {
        return this.reviews.bulkValidate(user, companyId, dto.ids);
    }

    @Post('registros/:idRegistro/validate')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Validar un registro de kiosco',
        description: 'Quita requiereRevision y deja una revisión VALIDAR con las banderas.',
    })
    @ApiParam({ name: 'companyId', type: Number })
    @ApiParam({ name: 'idRegistro', type: String })
    @ApiBody({ type: ValidateRegistroDto, required: false })
    @ApiResponse({ status: 200, description: 'Registro validado.' })
    @ApiResponse({ status: 404, description: 'Registro no encontrado.' })
    @ApiResponse({ status: 409, description: 'El registro ya fue revisado.' })
    validate(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('idRegistro') idRegistro: string,
        @Body() dto: ValidateRegistroDto,
    ) {
        return this.reviews.validate(user, companyId, idRegistro, dto ?? {});
    }

    @Post('registros/:idRegistro/reject')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Rechazar un registro de kiosco',
        description: 'Anula el registro, quita la revisión pendiente y deja una revisión RECHAZAR.',
    })
    @ApiParam({ name: 'companyId', type: Number })
    @ApiParam({ name: 'idRegistro', type: String })
    @ApiBody({ type: RejectRegistroDto })
    @ApiResponse({ status: 200, description: 'Registro anulado.' })
    @ApiResponse({ status: 409, description: 'El registro ya fue revisado.' })
    reject(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('idRegistro') idRegistro: string,
        @Body() dto: RejectRegistroDto,
    ) {
        return this.reviews.reject(user, companyId, idRegistro, dto);
    }

    @Post('registros/:idRegistro/reassign')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Reasignar un registro de kiosco',
        description: 'Anula el original, crea el registro del empleado nuevo y recalcula ambas jornadas. No modifica idEmpleado del original.',
    })
    @ApiParam({ name: 'companyId', type: Number })
    @ApiParam({ name: 'idRegistro', type: String })
    @ApiBody({ type: ReassignRegistroDto })
    @ApiResponse({ status: 200, description: 'Registro reasignado.' })
    @ApiResponse({ status: 409, description: 'El registro ya fue revisado o el empleado es el mismo.' })
    reassign(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('idRegistro') idRegistro: string,
        @Body() dto: ReassignRegistroDto,
    ) {
        return this.reviews.reassign(user, companyId, idRegistro, dto);
    }

    @Post('incidencias/:id/approve')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Aprobar una incidencia',
        description: 'Crea el registro del candidato con la hora y la evidencia originales. Si agregarEmpleadoSite es true, lo asigna al site.',
    })
    @ApiParam({ name: 'companyId', type: Number })
    @ApiParam({ name: 'id', type: String })
    @ApiBody({ type: ApproveIncidenciaDto, required: false })
    @ApiResponse({ status: 200, description: 'Incidencia aprobada.' })
    @ApiResponse({ status: 409, description: 'La incidencia ya fue resuelta o no tiene candidato.' })
    approve(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id') id: string,
        @Body() dto: ApproveIncidenciaDto,
    ) {
        return this.reviews.approve(user, companyId, id, dto ?? {});
    }

    @Post('incidencias/:id/correct')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Corregir una incidencia',
        description: 'Igual que aprobar, pero el registro queda a nombre de otro empleado y la incidencia pasa a CORREGIDA.',
    })
    @ApiParam({ name: 'companyId', type: Number })
    @ApiParam({ name: 'id', type: String })
    @ApiBody({ type: CorrectIncidenciaDto })
    @ApiResponse({ status: 200, description: 'Incidencia corregida.' })
    @ApiResponse({ status: 409, description: 'La incidencia ya fue resuelta.' })
    correct(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id') id: string,
        @Body() dto: CorrectIncidenciaDto,
    ) {
        return this.reviews.correct(user, companyId, id, dto);
    }

    @Post('incidencias/:id/reject')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Rechazar una incidencia',
        description: 'Marca la incidencia como RECHAZADA y deja una revisión RECHAZAR. No crea un registro de asistencia.',
    })
    @ApiParam({ name: 'companyId', type: Number })
    @ApiParam({ name: 'id', type: String })
    @ApiBody({ type: RejectIncidenciaDto })
    @ApiResponse({ status: 200, description: 'Incidencia rechazada.' })
    @ApiResponse({ status: 409, description: 'La incidencia ya fue resuelta.' })
    rejectIncidencia(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id') id: string,
        @Body() dto: RejectIncidenciaDto,
    ) {
        return this.reviews.rejectIncidencia(user, companyId, id, dto);
    }
}
