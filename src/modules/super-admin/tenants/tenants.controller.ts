import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UpdateTenantModulesDto } from './dto/update-tenant-modules.dto';

@ApiTags('Tenants')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@ApiBearerAuth()
@Controller('super-admin/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) { }

  // Crear un nuevo tenant con un usuario administrador
  @Post()
  @ApiOperation({ summary: 'Create a new tenant with an admin user' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  createTenant(
    @Body() createTenantDto: CreateTenantDto
  ) {
    return this.tenantsService.create(createTenantDto);
  }

  // Obtener todos los tenants paginados
  @Get()
  @ApiOperation({ summary: 'Get all tenants paginated' })
  @ApiResponse({ status: 200, description: 'Tenants retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  findAllTenants(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
    @Query('search') search?: string
  ) {
    return this.tenantsService.findAll(page ?? 1, limit ?? 10, search || '');
  }

  // Obtener todos los tenants paginados
  @Get(':id')
  @ApiOperation({ summary: 'Get one tenant' })
  @ApiResponse({ status: 200, description: 'Tenant retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  findOneTenant(
    @Param('id') id: string
  ) {
    return this.tenantsService.findOne(id);
  }

  // Actualizar el estado de los módulos de un tenant
  @Patch(':id/modules')
  @ApiOperation({ summary: 'Update active status for tenant modules' })
  @ApiResponse({ status: 200, description: 'Modules updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  updateTenantModules(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTenantModulesDto
  ) {
    return this.tenantsService.updateModules(id, dto);
  }

}
