import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { MobileJwtAuthGuard } from 'src/modules/mobile/mobile-auth/guards/mobile-jwt-auth.guard';
import { CommsCapabilityService } from './comms-capability.service';

@ApiTags('Mobile Comms')
@ApiBearerAuth()
@UseGuards(MobileJwtAuthGuard, CompanyTenantGuard)
@Controller('mobile/companies/:companyId/me/comms-capabilities')
export class MobileCommsCapabilitiesController {
    constructor(private readonly service: CommsCapabilityService) {}

    @Get()
    @ApiOperation({
        summary: 'Capacidades de comunicación en la app',
        description: 'La misma respuesta que la web. La app la usa para mostrar «Aviso a mi equipo» cuando hay COM_CREAR y el tipo AVISO_EQUIPO.',
    })
    @ApiResponse({ status: 200, description: 'Capacidades efectivas, con el alcance mayor y los tipos unidos.' })
    @ApiResponse({ status: 401, description: 'Token móvil ausente o inválido.' })
    @ApiResponse({ status: 403, description: 'La empresa no pertenece al tenant del usuario.' })
    misCapacidades(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.service.efectivasConNombres(activeUser, companyId);
    }
}
