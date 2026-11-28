import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
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
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import {
  ProgramacionQuery,
  ProgramarPendientesDto,
  RechazarLoteDto,
} from './dto/pending.dto';
import { PendingService } from './pending.service';

@ApiTags('Pendientes de capacitación')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard)
@Controller('companies/:companyId/learning-paths/pending')
export class PendingController {
  constructor(private readonly pendientes: PendingService) {}

  @Get('schedule')
  @ApiOperation({
    summary: 'Por programar',
    description: 'Agrupa cursos presenciales o sin sesión por curso y site.',
  })
  @ApiResponse({ status: 200, description: 'Grupos pendientes de sesión.' })
  programacion(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: ProgramacionQuery,
  ) {
    return this.pendientes.programacion(user, companyId, query);
  }

  @Post('schedule')
  @ApiOperation({
    summary: 'Crear la sesión e inscribir a los pendientes',
    description:
      'Inscribe solo a los grupos indicados. No reemplaza a quien ya estaba en la sesión.',
  })
  @ApiResponse({
    status: 201,
    description: 'Sesión creada e inscritos del grupo.',
  })
  programar(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: ProgramarPendientesDto,
  ) {
    return this.pendientes.programar(user, companyId, dto);
  }

  @Get('approve')
  @ApiOperation({ summary: 'Lotes por aprobar' })
  @ApiResponse({ status: 200, description: 'Lotes pendientes de RH.' })
  aprobarLista(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.pendientes.lotes(user, companyId);
  }

  @Get('approve/:idLote')
  @ApiOperation({ summary: 'Detalle de un lote' })
  @ApiResponse({
    status: 200,
    description: 'Personas y el estado que tendrá cada curso.',
  })
  detalle(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idLote', ParseIntPipe) idLote: number,
  ) {
    return this.pendientes.detalle(user, companyId, idLote);
  }

  @Post('approve/:idLote/approve')
  @ApiOperation({ summary: 'Aprobar el lote' })
  @ApiResponse({ status: 201, description: 'Lote aplicado.' })
  @ApiResponse({ status: 409, description: 'LOTE_NO_PENDIENTE.' })
  aprobar(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idLote', ParseIntPipe) idLote: number,
  ) {
    return this.pendientes.aprobar(user, companyId, idLote);
  }

  @Post('approve/:idLote/reject')
  @ApiOperation({ summary: 'Rechazar el lote' })
  @ApiResponse({ status: 201, description: 'Lote y asignaciones cancelados.' })
  rechazar(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idLote', ParseIntPipe) idLote: number,
    @Body() dto: RechazarLoteDto,
  ) {
    return this.pendientes.rechazar(user, companyId, idLote, dto.motivo);
  }

  @Get('overdue')
  @ApiOperation({ summary: 'Vencidos por fecha límite o por vigencia' })
  @ApiResponse({ status: 200, description: 'Elementos vencidos.' })
  vencidos(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.pendientes.vencidos(user, companyId);
  }
}
