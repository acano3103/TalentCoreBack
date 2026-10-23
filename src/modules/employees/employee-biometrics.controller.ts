import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { BiometricPhotoUpload, EmployeeBiometricsService, MAX_FOTO_ROSTRO_BYTES } from './employee-biometrics.service';
import { CreateBiometricPersonDto } from './dto/create-biometric-person.dto';

// Endpoints de biométricos del empleado (ZkBio Integration API vía integración de la empresa)
@ApiTags('Employee Biometrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId')
export class EmployeeBiometricsController {
    constructor(private readonly employeeBiometricsService: EmployeeBiometricsService) { }

    // Endpoint que obtiene los departamentos del biométrico (solo la rama de la empresa)
    @Get('biometrics/departments')
    @ApiOperation({ summary: 'Get biometric departments of the company branch (ZKBio)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Departments retrieved successfully' })
    @ApiResponse({ status: 400, description: 'Biometric integration is not connected or has no parent department' })
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

    // Endpoint que obtiene el estado biométrico del empleado
    @Get('employees/:employeeId/biometrics')
    @ApiOperation({ summary: 'Get employee biometric status (ZKBio)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Biometric status retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Employee not found in this company' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    getEmployeeBiometrics(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('employeeId', ParseIntPipe) employeeId: number,
    ) {
        return this.employeeBiometricsService.getEmployeeBiometrics(activeUser, companyId, employeeId);
    }

    // Endpoint que da de alta al empleado en el biométrico
    @Post('employees/:employeeId/biometrics/person')
    @ApiOperation({ summary: 'Register employee in the biometric system (ZKBio)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Employee registered in ZKBio' })
    @ApiResponse({ status: 400, description: 'Missing employee data, invalid department or integration not connected' })
    @ApiResponse({ status: 409, description: 'Employee or employee number already registered' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    registerEmployee(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('employeeId', ParseIntPipe) employeeId: number,
        @Body() dto: CreateBiometricPersonDto,
    ) {
        return this.employeeBiometricsService.registerEmployee(activeUser, companyId, employeeId, dto);
    }

    // Endpoint que sube la foto del rostro del empleado al biométrico (multipart, campo "foto")
    @Put('employees/:employeeId/biometrics/face')
    @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: MAX_FOTO_ROSTRO_BYTES + 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { foto: { type: 'string', format: 'binary', description: 'JPG o PNG, máx. 5 MB' } } } })
    @ApiOperation({ summary: 'Upload employee face photo to the biometric system (ZKBio)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Face photo registered in ZKBio' })
    @ApiResponse({ status: 400, description: 'Employee not registered, missing or invalid photo' })
    @ApiResponse({ status: 422, description: 'ZKBio did not detect a face in the photo' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    uploadFace(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('employeeId', ParseIntPipe) employeeId: number,
        @UploadedFile() foto: BiometricPhotoUpload,
    ) {
        return this.employeeBiometricsService.uploadFace(activeUser, companyId, employeeId, foto);
    }
}
