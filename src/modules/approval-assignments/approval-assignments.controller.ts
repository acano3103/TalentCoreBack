import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { ApprovalAssignmentsService } from './approval-assignments.service';
import { CreateApprovalAssignmentDto } from './dto/create-approval-assignment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';

@ApiTags('Approval Assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approval-assignments')
export class ApprovalAssignmentsController {
  constructor(private readonly approvalAssignmentsService: ApprovalAssignmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get current approval role assignments',
    description: SWAGGER_AUTH_DESCRIPTION
  })
  @ApiQuery({ name: 'idRolAprobador', required: false, type: Number, description: 'Filtrar por rol de aprobación' })
  @ApiQuery({ name: 'idArea', required: false, type: Number, description: 'Filtrar por área' })
  @ApiResponse({ status: 200, description: 'List of approval assignments successfully retrieved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(
    @Query('idRolAprobador') idRolAprobador?: string,
    @Query('idArea') idArea?: string,
  ) {
    return this.approvalAssignmentsService.findAll(
      idRolAprobador ? Number(idRolAprobador) : undefined,
      idArea ? Number(idArea) : undefined
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Assign a user to an approval role (Admin only)',
    description: 'Assigns a specific user to an approval role with optional area scope. Only administrators can perform this action.'
  })
  @ApiResponse({ status: 201, description: 'Approval assignment created/reactivated successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden: Only administrators can assign approval roles.' })
  @ApiResponse({ status: 404, description: 'User, approval role or area not found.' })
  @ApiResponse({ status: 409, description: 'Conflict: An active approver is already assigned to this role/area.' })
  create(
    @Body() dto: CreateApprovalAssignmentDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.approvalAssignmentsService.create(dto, activeUser);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deactivate an approval assignment (Admin only)',
    description: 'Deactivates an approval assignment (soft delete). Only administrators can perform this action.'
  })
  @ApiResponse({ status: 200, description: 'Approval assignment deactivated successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden: Only administrators can deactivate approval roles.' })
  @ApiResponse({ status: 404, description: 'Approval assignment not found.' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.approvalAssignmentsService.remove(id, activeUser);
  }
}
