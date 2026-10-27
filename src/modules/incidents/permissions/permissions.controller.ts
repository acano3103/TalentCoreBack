import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/incidents/permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) { }

  // Obtiene el balance de permisos de un empleado
  @Get('balance/:employeeId')
  @ApiOperation({ summary: 'Get permissions balance', description: 'Get an employee permissions balance.' })
  @ApiResponse({ status: 200, description: 'Employee permissions balance retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  getEmployeesPermissionBalance(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ): Promise<any> {
    return this.permissionsService.getEmployeeBalance(activeUser, companyId, employeeId);
  }

  // Crear solicitud de permiso
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiOperation({ summary: 'Create permission request', description: 'Registers a new permission incident for the employee or their subordinate.' })
  @ApiResponse({ status: 201, description: 'Permission request created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request. Validation or business rule errors.' })
  @ApiResponse({ status: 404, description: 'Target or requester employee not found.' })
  createPermission(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreatePermissionDto,
    @UploadedFile() archivo?: Express.Multer.File,
  ): Promise<any> {
    return this.permissionsService.createPermission(activeUser, companyId, dto, archivo);
  }

  // Subir comprobante de un permiso
  @Patch(':idSolicitud/attachment')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024, } }))
  @ApiOperation({ summary: 'Upload permission attachment', description: 'Uploads a proof document to an existing permission request.' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Attachment uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or upload deadline expired.' })
  @ApiResponse({ status: 404, description: 'Permission request not found.' })
  async uploadPermissionAttachment(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    return this.permissionsService.uploadPermissionAttachment(activeUser, companyId, idSolicitud, archivo);
  }
}