import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { EmployeeBiometricsService } from './employee-biometrics.service';

// Endpoints de biométricos del empleado (ZkBio Integration API vía integración de la empresa)
@ApiTags('Employee Biometrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId')
export class EmployeeBiometricsController {
    constructor(private readonly employeeBiometricsService: EmployeeBiometricsService) { }

    // Endpoint que obtiene los departamentos del biométrico
    @Get('biometrics/departments')
    @ApiOperation({ summary: 'Get biometric departments (ZKBio)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Departments retrieved successfully' })
    @ApiResponse({ status: 400, description: 'Biometric integration is not connected' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    getDepartments(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.employeeBiometricsService.getDepartments(activeUser, companyId);
    }

    // Endpoint que obtiene los niveles de acceso del biométrico
    @Get('biometrics/access-levels')
    @ApiOperation({ summary: 'Get biometric access levels (ZKBio)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Access levels retrieved successfully' })
    @ApiResponse({ status: 400, description: 'Biometric integration is not connected' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    getAccessLevels(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.employeeBiometricsService.getAccessLevels(activeUser, companyId);
    }
}
