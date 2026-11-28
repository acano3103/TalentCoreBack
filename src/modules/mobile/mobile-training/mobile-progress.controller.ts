import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { AnioStatsQuery } from './dto/anio-stats.query';
import { HistorialQuery } from './dto/historial.query';
import { MarcarLogrosVistosDto } from './dto/marcar-logros.dto';
import { MobileTrainingService } from './mobile-training.service';

@ApiTags('Mobile Training')
@ApiBearerAuth()
@UseGuards(MobileJwtAuthGuard, CompanyTenantGuard)
@Controller('mobile/companies/:companyId/training')
export class MobileProgressController {
  constructor(private readonly training: MobileTrainingService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Inicio de capacitación',
    description:
      'Gamificación del empleado, conteos, el curso por vencer más urgente, el asíncrono para continuar, la próxima clase, las horas del año, el plan de carrera si tiene uno y la tarjeta miRuta. planCarrera, cuando existe, incluye idPlanCarrera y nivelPreparacion (listo_ahora, listo_sin_plaza, uno_a_dos_anios o en_desarrollo).',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen de la pantalla Cursos e Inicio.',
  })
  resumen(
    @Param('companyId', ParseIntPipe) companyId: number,
    @GetActiveUser() user: ActiveUserDto,
  ) {
    return this.training.resumen(companyId, user);
  }

  @Get('learning-path')
  @ApiOperation({
    summary: 'Ruta de aprendizaje del empleado',
    description:
      'Unión de las rutas que le aplican, sin cursos repetidos. Las etapas se agrupan por nombre y orden. Una etapa queda bloqueada si pide la anterior y esa no está completa. Cada curso trae calificacion (valor guardado, sin normalizar) y fechaCompletado (YYYY-MM-DD); ambos llegan con valor solo si el estado es completado o reconocido, y null en otro caso. Cada etapa trae fechaCompletada (YYYY-MM-DD): la fechaCompletado más reciente de sus cursos obligatorios, solo si la etapa está completada; si no, null. Sin ruta responde { rutas: [], avance: { completados: 0, total: 0 }, etapas: [], porRenovar: [] }. Nunca null ni 404.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rutas, avance, etapas y cursos por renovar.',
  })
  ruta(
    @Param('companyId', ParseIntPipe) companyId: number,
    @GetActiveUser() user: ActiveUserDto,
  ) {
    return this.training.miRuta(companyId, user);
  }

  @Get('career-plan')
  @ApiOperation({
    summary: 'Plan de carrera del empleado',
    description:
      'Planes del empleado de la sesión, normalmente uno. Cada plan incluye idPlanCarrera y nivelPreparacion (listo_ahora, listo_sin_plaza, uno_a_dos_anios o en_desarrollo), además de requisitos, fechaLimiteRenovacion y cursoVencido. No se postula desde la app.',
  })
  @ApiResponse({
    status: 200,
    description: 'planes del empleado, o un arreglo vacío.',
  })
  @ApiResponse({
    status: 404,
    description: 'El usuario no tiene empleado en esta empresa.',
  })
  planCarrera(
    @Param('companyId', ParseIntPipe) companyId: number,
    @GetActiveUser() user: ActiveUserDto,
  ) {
    return this.training.planCarrera(companyId, user);
  }

  @Get('achievements')
  @ApiOperation({
    summary: 'XP, nivel, racha e insignias',
    description:
      'Las seis insignias, ganadas y bloqueadas, con el progreso de cada una. No hay ranking.',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de gamificación del empleado.',
  })
  logros(
    @Param('companyId', ParseIntPipe) companyId: number,
    @GetActiveUser() user: ActiveUserDto,
  ) {
    return this.training.logros(companyId, user);
  }

  @Post('achievements/seen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marcar insignias como vistas',
    description:
      'Pone vistoEn en ahora para los códigos del empleado. Si ya estaban vistas, vuelve a dejar la hora actual.',
  })
  @ApiResponse({
    status: 200,
    description: 'actualizados: cuántas insignias se marcaron.',
  })
  vistos(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: MarcarLogrosVistosDto,
    @GetActiveUser() user: ActiveUserDto,
  ) {
    return this.training.marcarVistos(companyId, user, dto.codigos);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Mi progreso de un año',
    description:
      'Horas de estudio más duración de las clases asistidas, cursos aprobados, promedio y porcentaje a tiempo. El tiempo anterior a CursoTiempoDiario se asigna al mes de la última actividad.',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas del año, con los 12 meses.',
  })
  stats(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: AnioStatsQuery,
    @GetActiveUser() user: ActiveUserDto,
  ) {
    return this.training.estadisticas(companyId, user, query.anio);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Historial de cursos cerrados',
    description:
      'Aprobados, no aprobados y no realizados, de todas las modalidades, del más reciente al más antiguo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de cursos cerrados y el total.',
  })
  historial(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: HistorialQuery,
    @GetActiveUser() user: ActiveUserDto,
  ) {
    return this.training.historial(
      companyId,
      user,
      query.pagina ?? 1,
      query.porPagina ?? 20,
    );
  }
}
