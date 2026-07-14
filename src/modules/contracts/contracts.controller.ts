import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('Contracts')
@Controller('companies/:companyId/contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) { }

  // Endpoint para obtener todos los empleados que ya cuentan con el expediente completo
  @Get('/ready-to-hire')
  @ApiOperation({ summary: 'Get all employees who have completed their digital file', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'List of employees for a company' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or RFC' })
  getReadyToHire(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.contractsService.getReadyToHire(companyId, page, limit, search || '');
  }

}
