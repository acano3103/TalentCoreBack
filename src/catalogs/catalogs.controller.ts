import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('catalogs')
@ApiBearerAuth()
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('roles')
  @ApiOperation({
    summary: 'Get roles catalog',
    description: 'Returns all active system roles (catroles table).',
  })
  @ApiResponse({ status: 200, description: 'List of roles successfully retrieved.' })
  findAllRoles() {
    return this.catalogsService.findAllRoles();
  }
}
