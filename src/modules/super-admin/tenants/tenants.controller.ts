import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

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

}
