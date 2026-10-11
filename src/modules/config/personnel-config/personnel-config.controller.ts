import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { PersonnelConfigService } from './personnel-config.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CreateApprovalWorkflowBatchDto } from './dto/create-approval-workflow.dto';
import { PaginationApprovalWorkflowDto } from './dto/pagination-approval-workflow.dto';

@ApiTags('Personnel Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/personnel-config')
export class PersonnelConfigController {
  constructor(private readonly personnelConfigService: PersonnelConfigService) { }

  // Este endpoint retorna los flujos de aprobacion paginados
  @Get('approval-workflows')
  @ApiOperation({ summary: 'Get paginated list of approval workflows', description: 'Returns workflows grouped by movement/incident with pagination and optional search', })
  @ApiResponse({ status: 200, description: 'Approval workflows retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getApprovalWorkflows(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: PaginationApprovalWorkflowDto,
  ) {
    return this.personnelConfigService.obtenerFlujosDeAprobacionPaginados(user.idTenant, companyId, query);
  }

  // Este endpoint retorna el flujo de aprobacion por tipo de movimiento
  @Get('approval-workflows/movement-types/:idTipoMovimiento')
  @ApiOperation({ summary: 'Get approval workflow by movement type', description: 'Returns approval workflow for a specific movement type', })
  @ApiResponse({ status: 200, description: 'Approval workflow retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getWorkflowByMovementType(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idTipoMovimiento', ParseIntPipe) idTipoMovimiento: number,
  ) {
    return this.personnelConfigService.obtenerFlujoPorTipoMovimiento(user.idTenant, companyId, idTipoMovimiento);
  }

  // Este endpoint retorna los tipos de movimiento por modulo
  @Get('modules/:idModulo/movement-types')
  @ApiOperation({ summary: 'Get movement types for a module', description: 'Returns movement types for a module' })
  @ApiResponse({ status: 200, description: 'Movement types retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getMovementsTypes(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idModulo', ParseIntPipe) idModulo: number,
  ) {
    return this.personnelConfigService.obtenerTiposDeMovimientoPorModulo(user.idTenant, companyId, idModulo);
  }

  // Este endpoint guarda el flujo de aprobacion
  @Post('approval-workflows')
  @ApiOperation({ summary: 'Create or update full approval workflow sequence', description: 'Saves the complete sequential pipeline of approval steps for a movement or incident type' })
  @ApiResponse({ status: 201, description: 'Approval workflow created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  createApprovalWorkflow(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateApprovalWorkflowBatchDto,
  ) {
    return this.personnelConfigService.guardarFlujoAprobacionCompleto(user.idTenant, companyId, dto);
  }
}
