import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ComplianceService } from './compliance.service';
import {
  CumplimientoQuery,
  GenerarDc3Dto,
  ListarDc3Query,
  ListarDc4Query,
  PrepararDc4Dto,
} from './dto/compliance.dto';

@ApiTags('Cumplimiento de capacitación')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard)
@Controller('companies/:companyId/learning-paths/compliance')
export class ComplianceController {
  constructor(
    private readonly cumplimiento: ComplianceService,
    private readonly excel: ExcelExportService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Tablero de cumplimiento',
    description:
      'KPIs, matriz por site y ruta, y los próximos vencimientos. Filtros: solo obligatorios y site.',
  })
  @ApiResponse({ status: 200, description: 'Tablero de la empresa.' })
  tablero(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: CumplimientoQuery,
  ) {
    return this.cumplimiento.tablero(user, companyId, query);
  }

  @Get('dc3')
  @ApiOperation({ summary: 'Constancias DC-3' })
  @ApiResponse({ status: 200, description: 'Lista filtrada por estatus.' })
  dc3(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: ListarDc3Query,
  ) {
    return this.cumplimiento.constancias(user, companyId, query.estatus);
  }

  @Post('dc3/generate')
  @ApiOperation({
    summary: 'Generar PDF de constancias DC-3',
    description:
      'Genera las indicadas o todas las pendientes. Si falta un dato, no genera ninguna y responde 422.',
  })
  @ApiResponse({ status: 201, description: 'PDFs generados.' })
  @ApiResponse({
    status: 422,
    description:
      'DATOS_INCOMPLETOS. detail.faltantes lista los campos por persona.',
  })
  generarDc3(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: GenerarDc3Dto,
  ) {
    return this.cumplimiento.generarDc3(user, companyId, dto.idsConstancia);
  }

  @Patch('dc3/:id/delivered')
  @ApiOperation({ summary: 'Marcar la constancia DC-3 como entregada' })
  @ApiResponse({ status: 200, description: 'Constancia entregada.' })
  entregarDc3(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cumplimiento.entregarDc3(user, companyId, id);
  }

  @Get('dc4')
  @ApiOperation({
    summary: 'Listas DC-4 por establecimiento',
    description:
      'Una fila por site. Sin lista preparada, el cierre es el 31 de diciembre y el límite es 60 días hábiles después.',
  })
  @ApiResponse({ status: 200, description: 'Reportes del año.' })
  dc4(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: ListarDc4Query,
  ) {
    return this.cumplimiento.reportesDc4(user, companyId, query.anio);
  }

  @Post('dc4')
  @ApiOperation({
    summary: 'Preparar la lista DC-4',
    description:
      'Arma el Excel del establecimiento, liga las constancias del periodo y descarga el archivo.',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiResponse({ status: 201, description: 'Excel de la lista DC-4.' })
  @ApiResponse({ status: 409, description: 'REPORTE_PRESENTADO.' })
  async prepararDc4(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: PrepararDc4Dto,
    @Res() res: Response,
  ) {
    const archivo = await this.cumplimiento.prepararDc4(user, companyId, dto);
    this.excel.send(res, archivo.buffer, archivo.nombre);
  }

  @Patch('dc4/:id/presented')
  @ApiOperation({ summary: 'Marcar la lista DC-4 como presentada' })
  @ApiResponse({ status: 200, description: 'Lista presentada.' })
  presentarDc4(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cumplimiento.presentarDc4(user, companyId, id);
  }
}
