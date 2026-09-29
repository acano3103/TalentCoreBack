import {
    Body,
    Controller,
    DefaultValuePipe,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { BlockDeviceDto } from './dto/block-device.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { MobileDeviceUser, MobileDevicesService } from './mobile-devices.service';

@ApiTags('Mobile Devices')
@ApiBearerAuth()
@UseGuards(MobileJwtAuthGuard)
@Controller('mobile/devices')
export class MobileDevicesController {
    constructor(private readonly mobileDevicesService: MobileDevicesService) {}

    @Post('register')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Registrar o actualizar el dispositivo del colaborador',
        description: 'El empleado, la empresa y el tenant se leen del JWT móvil. Un dispositivo nuevo nace PENDIENTE.',
    })
    @ApiResponse({ status: 200, description: 'Dispositivo registrado o actualizado' })
    @ApiResponse({ status: 409, description: 'El dispositivo ya está vinculado a otro colaborador' })
    @ApiResponse({ status: 401, description: 'Token móvil inválido o expirado' })
    register(
        @GetActiveUser() user: MobileDeviceUser,
        @Body() dto: RegisterDeviceDto,
    ) {
        return this.mobileDevicesService.register(user, dto);
    }
}

@ApiTags('Attendance Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/attendance/devices')
export class AttendanceDevicesController {
    constructor(private readonly mobileDevicesService: MobileDevicesService) {}

    @Get('pending-count')
    @ApiOperation({
        summary: 'Contador de dispositivos pendientes de aprobación',
        description: SWAGGER_AUTH_DESCRIPTION,
    })
    @ApiResponse({ status: 200, description: 'Contador obtenido correctamente' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    pendingCount(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.mobileDevicesService.pendingCount(user, companyId);
    }

    @Get()
    @ApiOperation({
        summary: 'Listar dispositivos de asistencia de la empresa',
        description: SWAGGER_AUTH_DESCRIPTION,
    })
    @ApiQuery({ name: 'page', required: false, example: 1 })
    @ApiQuery({ name: 'limit', required: false, example: 10 })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'estatus', required: false, enum: ['PENDIENTE', 'APROBADO', 'BLOQUEADO', 'BAJA'] })
    @ApiResponse({ status: 200, description: 'Dispositivos obtenidos correctamente' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    findAll(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('estatus') estatus?: string,
    ) {
        return this.mobileDevicesService.findAll(user, companyId, page, limit, search, estatus);
    }

    @Patch(':id/approve')
    @ApiOperation({
        summary: 'Aprobar un dispositivo de asistencia',
        description: SWAGGER_AUTH_DESCRIPTION,
    })
    @ApiResponse({ status: 200, description: 'Dispositivo aprobado' })
    @ApiResponse({ status: 404, description: 'Dispositivo no encontrado' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    approve(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.mobileDevicesService.approve(user, companyId, id);
    }

    @Patch(':id/block')
    @ApiOperation({
        summary: 'Bloquear un dispositivo de asistencia',
        description: SWAGGER_AUTH_DESCRIPTION,
    })
    @ApiResponse({ status: 200, description: 'Dispositivo bloqueado' })
    @ApiResponse({ status: 404, description: 'Dispositivo no encontrado' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    block(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: BlockDeviceDto,
    ) {
        return this.mobileDevicesService.block(user, companyId, id, dto);
    }
}
