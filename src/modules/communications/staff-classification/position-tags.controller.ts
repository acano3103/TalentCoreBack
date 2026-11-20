import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CreatePositionTagDto } from './dto/create-position-tag.dto';
import { PositionTagsService } from './position-tags.service';

@ApiTags('Comunicación interna')
@ApiBearerAuth()
// TODO capability
@UseGuards(JwtAuthGuard, CompanyTenantGuard)
@Controller('companies/:companyId/position-tags')
export class PositionTagsController {
    constructor(private readonly service: PositionTagsService) {}

    @Get()
    @ApiOperation({
        summary: 'Buscar etiquetas de puesto del tenant',
        description: 'Devuelve hasta 20 etiquetas activas, en orden alfabético. El catálogo es del tenant, no de la empresa.',
    })
    @ApiQuery({ name: 'search', required: false, description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Etiquetas obtenidas.' })
    @ApiResponse({ status: 401, description: 'Token ausente o inválido.' })
    @ApiResponse({ status: 403, description: 'La empresa no pertenece al tenant del usuario.' })
    buscar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('search') search?: string,
    ) {
        return this.service.buscar(activeUser.idTenant, companyId, search);
    }

    @Post()
    @ApiOperation({
        summary: 'Crear una etiqueta de puesto o devolver la existente',
        description: 'Si el nombre ya existe en el tenant, sin distinguir mayúsculas, se devuelve esa etiqueta.',
    })
    @ApiResponse({ status: 201, description: 'Etiqueta creada o ya existente.' })
    @ApiResponse({ status: 400, description: 'Nombre inválido.' })
    crear(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: CreatePositionTagDto,
    ) {
        return this.service.crear(activeUser.idTenant, companyId, dto.nombre);
    }
}
