import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UpdateTenantModulesDto } from './dto/update-tenant-modules.dto';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('super-admin/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) { }

  // Crear un nuevo tenant con un usuario administrador
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
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
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
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
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
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
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Patch(':id/modules')
  @ApiOperation({ summary: 'Update active status for tenant modules', description: 'This endpoint is used to enable or disable modules for a specific tenant.' })
  @ApiResponse({ status: 200, description: 'Modules updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  updateTenantModules(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTenantModulesDto
  ) {
    return this.tenantsService.updateModules(id, dto);
  }

  // Actualizar la configuración de feature flags de IA de un tenant
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Patch(':id/ai-config')
  @ApiOperation({ summary: 'Update AI feature flags for a tenant', description: 'This endpoint is used to enable or disable AI features for a specific tenant.' })
  @ApiResponse({ status: 200, description: 'AI configuration updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  updateTenantAiConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() aiConfig: Record<string, boolean>
  ) {
    return this.tenantsService.updateAiConfig(id, aiConfig);
  }

  // Obtener el estado de una feature flag de IA específica de un tenant
  @UseGuards(JwtAuthGuard)
  @Get('ai-features/:featureCode/status')
  @ApiOperation({ summary: 'Check if a specific AI feature is enabled for a tenant' })
  @ApiResponse({ status: 200, description: 'AI feature status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async checkAiFeatureStatus(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('featureCode') featureCode: string,
  ) {
    const isEnabled = await this.tenantsService.isAiFeatureEnabled(activeUser.idTenant, featureCode);
    return { tenantId: activeUser.idTenant, featureCode, enabled: isEnabled };
  }

}
