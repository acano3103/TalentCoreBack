import { Body, Controller, Get, Param, ParseIntPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Obtener saldo de permisos', description: 'Obtiene el balance de permisos de un empleado' })
  @ApiResponse({ status: 200, description: 'Saldo de permisos del empleado' })
  @ApiResponse({ status: 404, description: 'Empleado no encontrado' })
  getEmployeesPermissionBalance(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ): Promise<any> {
    return this.permissionsService.getEmployeeBalance(activeUser, companyId, employeeId);
  }

  // Crear solicitud de permiso
  @Post()
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiOperation({ summary: 'Crear solicitud de permiso', description: 'Crea una solicitud de permiso para un empleado' })
  @ApiResponse({ status: 201, description: 'Solicitud de permiso creada correctamente', })
  @ApiResponse({ status: 400, description: 'Datos de la solicitud inválidos', })
  @ApiResponse({ status: 404, description: 'Empleado no encontrado', })
  createPermission(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreatePermissionDto,
    @UploadedFile() archivo?: Express.Multer.File,
  ): Promise<any> {
    return this.permissionsService.createPermission(activeUser, companyId, dto, archivo);
  }
}