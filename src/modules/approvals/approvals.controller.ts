import { Controller, Get, Post, Body, UseGuards, Param, ParseIntPipe, Query, Patch } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ActionApprovalDto } from './dto/approve-reject-action.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetApprovalRequestDetailDto } from './dto/get-approval-request-detail.dto';
import { CancelApprovalDto } from './dto/cancel-action.dto';

@ApiTags('Approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) { }

  // Obtiene todas las solicitudes pendientes del usuario
  @Get('/requests/pending')
  @ApiOperation({ summary: 'Get all pending approvals', description: 'Get all pending approvals of the company.', })
  @ApiResponse({ status: 200, description: 'All pending approvals retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  async getPendingApprovals(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.approvalsService.getPendingApprovals(activeUser, companyId);
  }

  // Obtiene el detalle de una solicitud pendiente
  @Get('/requests/detail')
  @ApiOperation({ summary: 'Get pending approval request detail', description: 'Get pending approval request detail.', })
  @ApiResponse({ status: 200, description: 'Pending approval request detail retrieved successfully', })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.', })
  @ApiResponse({ status: 403, description: 'The user does not have permission to review this request', })
  @ApiResponse({ status: 404, description: 'La solicitud no existe', })
  async getApprovalRequestDetail(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: GetApprovalRequestDetailDto,
  ) {
    return this.approvalsService.getApprovalRequestDetail(activeUser, companyId, query);
  }

  // Realiza la acción (aprobar o rechazar) de una solicitud
  @Post('/requests/action')
  @ApiOperation({ summary: 'Process an approval action', description: 'Process an approval action.', })
  @ApiResponse({ status: 200, description: 'Approval action processed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  async processAction(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: ActionApprovalDto,
  ) {
    return this.approvalsService.processApprovalAction(activeUser, companyId, dto);
  }

  // Realiza la cancelación de una sulicitud por el solicitante o el solicitado
  @Patch('/requests/cancel')
  @ApiOperation({ summary: 'Cancel an approval request', description: 'Cancel an approval request.', })
  @ApiResponse({ status: 200, description: 'Approval request cancelled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  async cancelRequest(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CancelApprovalDto,
  ) {
    return this.approvalsService.cancelRequest(activeUser, companyId, dto);
  }
}