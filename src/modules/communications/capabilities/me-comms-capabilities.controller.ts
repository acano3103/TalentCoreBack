import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CommsCapabilityService } from './comms-capability.service';

@ApiTags('Comunicación interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard)
@Controller('companies/:companyId/me/comms-capabilities')
export class MeCommsCapabilitiesController {
    constructor(private readonly service: CommsCapabilityService) {}

    @Get()
    @ApiOperation({
        summary: 'Capacidades de comunicación de la persona autenticada',
        description: SWAGGER_AUTH_DESCRIPTION,
    })
    @ApiResponse({ status: 200, description: 'Capacidades efectivas, con el alcance mayor y los tipos unidos.' })
    @ApiResponse({ status: 401, description: 'Token ausente o inválido.' })
    @ApiResponse({ status: 403, description: 'La empresa no pertenece al tenant del usuario.' })
    misCapacidades(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.service.getEffective(activeUser, companyId);
    }
}
