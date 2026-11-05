import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { KiosksService } from './kiosks.service';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateKioskDto } from './dto/create-kiosk.dto';

@ApiTags('Kiosks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/kiosks')
export class KiosksController {
  constructor(private readonly kiosksService: KiosksService) { }

  // Crea un nuevo kiosco de asistencia
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un kiosco de asistencia', description: `Crea un kiosco de asistencia en modalidad FIJO o CUADRILLA.` })
  @ApiParam({ name: 'companyId', description: 'Identificador de la empresa', type: Number, example: 3 })
  @ApiBody({ type: CreateKioskDto })
  @ApiResponse({ status: 201, description: 'Kiosco creado correctamente.' })
  @ApiResponse({ status: 400, description: 'Configuración inválida o ubicaciones incorrectas.' })
  @ApiResponse({ status: 401, description: 'Usuario no autenticado o sin tenant.' })
  @ApiResponse({ status: 404, description: 'Empleado responsable no encontrado.' })
  @ApiResponse({ status: 409, description: 'Conflicto con un registro único.' })
  @ApiResponse({ status: 500, description: 'Error interno al crear el kiosco.' })
  create(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateKioskDto,
  ) {
    return this.kiosksService.createKiosk(activeUser, companyId, dto);
  }
}