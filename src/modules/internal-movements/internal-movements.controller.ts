import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { InternalMovementsService } from './internal-movements.service';
import { CreateInternalMovementDto } from './dto/create-internal-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { QueryInternalMovementsDto } from './dto/query-internal-movements.dto';
import { GetInternalMovementRequestDetailDto } from './dto/get-internal-movement-request.detail.dto';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { CreateStaffReductionMovementDto } from './dto/create-staff-reduction-movement.dto';

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

  // Crea una solicitud de baja de personal.
  @Post("staff-reduction")
  @UseInterceptors(AnyFilesInterceptor({ limits: { files: 20, fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Create staff reduction request", description: "Creates a staff reduction request with dynamic fields and supporting documents.", })
  @ApiResponse({ status: 201, description: "Staff reduction request created successfully", })
  @ApiResponse({ status: 400, description: "Invalid request data or missing documents", })
  @ApiResponse({ status: 401, description: "Unauthorized. Invalid credentials.", })
  createStaffReductionMovement(
    @Param("companyId", ParseIntPipe) companyId: number,
    @Body() createStaffReductionMovementDto: CreateStaffReductionMovementDto,
    @UploadedFiles() archivos: Express.Multer.File[],
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.internalMovementsService.createStaffReductionMovement(activeUser, companyId, createStaffReductionMovementDto, archivos);
  }
}
