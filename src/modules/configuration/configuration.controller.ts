import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ConfigurationService } from './configuration.service';
import { UpdateTrainingSettingsDto } from './dto/update-training-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('Configuration')
@Controller('companies/:companyId/settings')
export class ConfigurationController {
  constructor(private readonly configurationService: ConfigurationService) {}

  // Endpoint para obtener los ajustes de capacitacion (umbral aprobatorio)
  @Get('training')
  @ApiOperation({
    summary: 'Get training settings (passing score threshold)',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'Training settings' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  getTrainingSettings(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.configurationService.getTrainingSettings(companyId);
  }

  // Endpoint para actualizar el umbral aprobatorio de capacitacion (0-100)
  @Patch('training')
  @ApiOperation({
    summary: 'Update training settings (passing score threshold)',
    description: SWAGGER_AUTH_DESCRIPTION,
  })
  @ApiResponse({ status: 200, description: 'Training settings updated' })
  @ApiResponse({ status: 400, description: 'Invalid value (must be 0-100)' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials.',
  })
  updateTrainingSettings(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() updateTrainingSettingsDto: UpdateTrainingSettingsDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.configurationService.updateTrainingSettings(
      companyId,
      updateTrainingSettingsDto,
      activeUser,
    );
  }
}
