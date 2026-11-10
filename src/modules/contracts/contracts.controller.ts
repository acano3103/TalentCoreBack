import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CreateContractDto } from './dto/create-contract.dto';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

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

  @Post(':employeeId')
  @ApiOperation({ summary: 'Create a contract for an employee', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 201, description: 'Contract created successfully' })
  @ApiResponse({ status: 400, description: 'Employee already has a contract' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  create(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateContractDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.contractsService.create(companyId, employeeId, dto, activeUser.id);
  }

  @Patch(':contractId/status')
  @ApiOperation({ summary: 'Update contract status', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Contract status updated' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  updateStatus(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body('idEstatusContrato', ParseIntPipe) idEstatusContrato: number,
  ) {
    return this.contractsService.updateStatus(companyId, contractId, idEstatusContrato);
  }

}
