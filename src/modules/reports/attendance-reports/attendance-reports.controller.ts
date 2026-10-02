import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe, Query, Res, HttpStatus, Header } from '@nestjs/common';
import { AttendanceReportsService } from './attendance-reports.service';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { Response } from 'express';
import { DailyAttendanceReportFilterDto } from './dto/daily-attendance-report.dto';
import { ExcelExportService } from 'src/common/services/excel-export.service';

@ApiTags('Attendance Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/attendance-reports')
export class AttendanceReportsController {
  constructor(
    private readonly attendanceReportsService: AttendanceReportsService,
    private readonly excelExportService: ExcelExportService,
  ) { }

  // Genera y descarga el archivo Excel del reporte de asistencia diaria
  @Get('daily-attendance/export-excel')
  @ApiOperation({ summary: 'Exportar asistencia diaria a Excel (.xlsx)', description: 'Genera y descarga el archivo Excel con todos los registros que cumplen los filtros indicados.', })
  @ApiParam({ name: 'companyId', type: Number, description: 'ID de la empresa' })
  @ApiResponse({ status: 200, description: 'Archivo binario Excel generado exitosamente.', })
  @ApiResponse({ status: 500, description: 'Error al generar el archivo Excel.' })
  async exportDailyAttendanceExcel(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() filters: DailyAttendanceReportFilterDto,
    @Res() res: Response,
  ) {
    const buffer = await this.attendanceReportsService.exportDailyAttendanceExcel(user, companyId, filters);
    this.excelExportService.send(res, buffer, 'Reporte_Asistencia_Diaria');
  }

  @Get('lateness/export-excel')
  @ApiOperation({ summary: 'Exportar retardos a Excel (.xlsx)', description: 'Genera y descarga el archivo Excel con todos los retardos que cumplen los filtros indicados.', })
  @ApiParam({ name: 'companyId', type: Number, description: 'ID de la empresa' })
  @ApiResponse({ status: 200, description: 'Archivo binario Excel generado exitosamente.', })
  @ApiResponse({ status: 500, description: 'Error al generar el archivo Excel.' })
  async exportLateness(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() filters: DailyAttendanceReportFilterDto,
    @Res() res: Response,
  ) {
    const buffer = await this.attendanceReportsService.exportLatenessExcel(user, companyId, filters);
    this.excelExportService.send(res, buffer, 'Reporte_Retardos');
  }
}