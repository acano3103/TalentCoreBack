import { Body, Controller, Param, ParseIntPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { IncapacitiesService } from './incapacities.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { CreateIncapacityDto } from './dto/create-incapacity.dto';

@ApiTags('Incapacities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/incidents/incapacities')
export class IncapacitiesController {
  constructor(private readonly incapacitiesService: IncapacitiesService) { }

  // Crear solicitud de incapacidad
  @Post()
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiOperation({ summary: 'Crear solicitud de incapacidad', description: 'Crea una solicitud de incapacidad para un empleado.' })
  @ApiResponse({ status: 201, description: 'Solicitud de incapacidad creada correctamente.' })
  @ApiResponse({ status: 400, description: 'Datos de la solicitud inválidos.' })
  @ApiResponse({ status: 404, description: 'Empleado o tipo de movimiento no encontrado.' })
  createIncapacity(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateIncapacityDto,
    @UploadedFile() archivo?: Express.Multer.File,
  ): Promise<any> {
    return this.incapacitiesService.createIncapacity(activeUser, companyId, dto, archivo);
  }
}
