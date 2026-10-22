import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Query,
} from '@nestjs/common';
import { InternalMovementsService } from './internal-movements.service';
import { CreateInternalMovementDto } from './dto/create-internal-movement.dto';
import { CreateBajaDto } from './dto/baja.dto';
import { EvaluateMovementDto } from './dto/evaluate-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { QueryInternalMovementsDto } from './dto/query-internal-movements.dto';
import { GetInternalMovementRequestDetailDto } from './dto/get-internal-movement-request.detail.dto';

@ApiTags('Internal Movements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/internal-movements')
export class InternalMovementsController {

  constructor(private readonly internalMovementsService: InternalMovementsService) { }

  // Obtiene todos los movimientos internos de la empresa
  @Get()
  @ApiOperation({ summary: 'Get all internal movements', description: 'Get all internal movements of the company.' })
  @ApiResponse({ status: 200, description: 'All internal movements retrieved successfully', })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.', })
  findAll(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: QueryInternalMovementsDto,
  ) {
    return this.internalMovementsService.findAll(activeUser, companyId, query);
  }

  // Obtiene el detalle de un movimiento interno con su flujo de aprobacion
  @Get('detail')
  @ApiOperation({ summary: 'Get internal movement request detail', description: 'Gets an internal movement request and its approval flow without requiring the current user to be its assigned approver.', })
  @ApiResponse({ status: 200, description: 'Internal movement request detail retrieved successfully', })
  @ApiResponse({ status: 400, description: 'Invalid request origin.', })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.', })
  @ApiResponse({ status: 404, description: 'The internal movement request does not exist.', })
  getInternalMovementRequestDetail(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: GetInternalMovementRequestDetailDto,
  ) {
    return this.internalMovementsService.getInternalMovementRequestDetail(activeUser, companyId, query);
  }

  // Crea una solicitud de movimiento interno.
  @Post()
  @ApiOperation({ summary: 'Create internal movement request', description: "Allow to create an internal movement request." })
  @ApiResponse({ status: 201, description: 'Movement request created successfully', })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.', })
  createMovementRequest(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createInternalMovementDto: CreateInternalMovementDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.internalMovementsService.createMovementRequest(activeUser, companyId, createInternalMovementDto);
  }

  // @Post('movements')
  // @ApiOperation({
  //   summary: 'Create internal movement (direct or request)',
  //   description: SWAGGER_AUTH_DESCRIPTION,
  // })
  // @ApiResponse({ status: 201, description: 'Movement created successfully' })
  // create(
  //   @Param('companyId', ParseIntPipe) companyId: number,
  //   @Param('employeeId', ParseIntPipe) employeeId: number,
  //   @Body() createInternalMovementDto: CreateInternalMovementDto,
  //   @GetActiveUser() activeUser: ActiveUserDto,
  // ) {
  //   return this.internalMovementsService.create(
  //     activeUser,
  //     companyId,
  //     employeeId,
  //     createInternalMovementDto,
  //   );
  // }

  // // Evalua una solicitud de movimiento interno.
  // @Post('movements/:movementId/evaluate')
  // @ApiOperation({
  //   summary: 'Evaluate internal movement request (approve or reject)',
  //   description: SWAGGER_AUTH_DESCRIPTION,
  // })
  // @ApiResponse({ status: 200, description: 'Movement evaluated successfully' })
  // evaluateMovement(
  //   @Param('companyId', ParseIntPipe) companyId: number,
  //   @Param('movementId', ParseIntPipe) movementId: number,
  //   @Body() evaluateMovementDto: EvaluateMovementDto,
  //   @GetActiveUser() activeUser: ActiveUserDto,
  // ) {
  //   return this.internalMovementsService.evaluateMovement(
  //     companyId,
  //     movementId,
  //     evaluateMovementDto.action,
  //     activeUser,
  //   );
  // }

  // @Post('baja')
  // @ApiOperation({
  //   summary: 'Process employee termination (baja)',
  //   description: SWAGGER_AUTH_DESCRIPTION,
  // })
  // @ApiResponse({
  //   status: 201,
  //   description: 'Employee termination processed successfully',
  // })
  // createBaja(
  //   @Param('companyId', ParseIntPipe) companyId: number,
  //   @Param('employeeId', ParseIntPipe) employeeId: number,
  //   @Body() createBajaDto: CreateBajaDto,
  //   @GetActiveUser() activeUser: ActiveUserDto,
  // ) {
  //   return this.internalMovementsService.createBaja(
  //     activeUser,
  //     companyId,
  //     employeeId,
  //     createBajaDto,
  //   );
  // }

  // @Get('movements')
  // @ApiOperation({
  //   summary: 'Get movement history for employee',
  //   description: SWAGGER_AUTH_DESCRIPTION,
  // })
  // findByEmployee(
  //   @Param('companyId', ParseIntPipe) companyId: number,
  //   @Param('employeeId', ParseIntPipe) employeeId: number,
  // ) {
  //   return this.internalMovementsService.findByEmployee(companyId, employeeId);
  // }
}

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/movements')
export class CompanyMovementsController {
  constructor(
    private readonly internalMovementsService: InternalMovementsService,
  ) { }

  // @Get('requests')
  // @ApiOperation({
  //   summary: 'Get all movement requests for company',
  //   description: SWAGGER_AUTH_DESCRIPTION,
  // })
  // getMovementRequests(@Param('companyId', ParseIntPipe) companyId: number) {
  //   return this.internalMovementsService.getMovementRequests(companyId);
  // }

  // @Get('requests/pending-for-me')
  // @ApiOperation({
  //   summary: 'Get movement requests pending approval for active user',
  //   description: SWAGGER_AUTH_DESCRIPTION,
  // })
  // getPendingForMe(
  //   @Param('companyId', ParseIntPipe) companyId: number,
  //   @GetActiveUser() activeUser: ActiveUserDto,
  // ) {
  //   return this.internalMovementsService.getPendingRequestsForUser(
  //     companyId,
  //     activeUser,
  //   );
  // }
}
