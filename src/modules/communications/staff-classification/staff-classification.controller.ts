import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CommsCapabilityGuard } from '../capabilities/comms-capability.guard';
import { RequireCapability } from '../capabilities/require-capability.decorator';
import { CreateStaffTypeDto } from './dto/create-staff-type.dto';
import { UpdateStaffTypeDto } from './dto/update-staff-type.dto';
import { StaffClassificationService } from './staff-classification.service';

@ApiTags('Comunicación interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard, CommsCapabilityGuard)
@RequireCapability('CFG_PERMISOS')
@Controller('companies/:companyId/comms/staff-types')
export class StaffClassificationController {
    constructor(private readonly service: StaffClassificationService) {}

    @Get()
    @ApiOperation({ summary: 'Listar tipos de personal del tenant', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Tipos de personal obtenidos.' })
    @ApiResponse({ status: 401, description: 'Token ausente o inválido.' })
    @ApiResponse({ status: 403, description: 'La empresa no pertenece al tenant del usuario.' })
    listar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.service.listar(activeUser.idTenant, companyId);
    }

    @Post()
    @ApiOperation({ summary: 'Crear un tipo de personal', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Tipo de personal creado.' })
    @ApiResponse({ status: 400, description: 'Código o nombre inválidos.' })
    @ApiResponse({ status: 409, description: 'Ya existe ese código en el tenant.' })
    crear(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: CreateStaffTypeDto,
    ) {
        return this.service.crear(activeUser.idTenant, companyId, dto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Actualizar un tipo de personal', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Tipo de personal actualizado.' })
    @ApiResponse({ status: 404, description: 'El tipo no existe en este tenant.' })
    @ApiResponse({ status: 409, description: 'Ya existe ese código en el tenant.' })
    actualizar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateStaffTypeDto,
    ) {
        return this.service.actualizar(activeUser.idTenant, companyId, id, dto);
    }
}
