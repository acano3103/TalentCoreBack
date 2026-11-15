import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CommsCapabilityGuard } from '../capabilities/comms-capability.guard';
import { RequireCapability } from '../capabilities/require-capability.decorator';
import { ActualizarReglaDto } from './dto/actualizar-regla.dto';
import { HistorialRecordatoriosQuery } from './dto/historial-recordatorios.query';
import { ReminderRulesService } from './reminder-rules.service';

@ApiTags('Comunicación interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard, CommsCapabilityGuard)
@RequireCapability('CFG_RECORDATORIOS')
@Controller('companies/:companyId/comms/reminder-rules')
export class ReminderRulesController {
    constructor(private readonly service: ReminderRulesService) {}

    @Get()
    @ApiOperation({
        summary: 'Reglas de recordatorios de la empresa',
        description: 'Si todavía no hay filas, se crean las 11 reglas con los valores iniciales.',
    })
    @ApiResponse({ status: 200, description: 'Reglas R1 a R11.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD.' })
    listar(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.service.listar(activeUser, companyId);
    }

    @Get('history')
    @ApiOperation({ summary: 'Historial de recordatorios enviados', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Página del historial.' })
    historial(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: HistorialRecordatoriosQuery,
    ) {
        return this.service.historial(activeUser, companyId, query);
    }

    @Patch(':codigo')
    @ApiOperation({ summary: 'Actualizar una regla de recordatorio', description: 'Los parámetros se validan según el código.' })
    @ApiResponse({ status: 200, description: 'Regla actualizada.' })
    @ApiResponse({ status: 400, description: 'CONTENIDO_INVALIDO.' })
    actualizar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('codigo') codigo: string,
        @Body() dto: ActualizarReglaDto,
    ) {
        return this.service.actualizar(activeUser, companyId, codigo, dto);
    }

    @Post(':codigo/reset')
    @ApiOperation({ summary: 'Restablecer una regla a sus valores iniciales', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Regla restablecida.' })
    @ApiResponse({ status: 400, description: 'CONTENIDO_INVALIDO.' })
    restablecer(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('codigo') codigo: string,
    ) {
        return this.service.restablecer(activeUser, companyId, codigo);
    }
}
