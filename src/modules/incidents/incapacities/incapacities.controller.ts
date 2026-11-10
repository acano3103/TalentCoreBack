import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiOperation({ summary: 'Create an incapacity request', description: 'Creates an incapacity request for an employee.' })
  @ApiResponse({ status: 201, description: 'Incapacity request created successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 404, description: 'Employee or movement type not found.' })
  createIncapacity(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateIncapacityDto,
    @UploadedFile() archivo?: Express.Multer.File,
  ): Promise<any> {
    return this.incapacitiesService.createIncapacity(activeUser, companyId, dto, archivo);
  }
}
