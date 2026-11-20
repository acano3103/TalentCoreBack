import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CommsCapabilityGuard } from './comms-capability.guard';
import { CommsCapabilityService } from './comms-capability.service';
import { ReemplazarCapacidadesDto } from './dto/reemplazar-capacidades.dto';
import { RequireCapability } from './require-capability.decorator';

@ApiTags('Comunicación interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class CommsCapabilitiesController {
    constructor(private readonly service: CommsCapabilityService) {}

    @Get('comms-capabilities')
    @ApiOperation({
        summary: 'Catálogo de capacidades de comunicación',
        description: SWAGGER_AUTH_DESCRIPTION,
    })
    @ApiResponse({ status: 200, description: 'Capacidades del catálogo.' })
    @ApiResponse({ status: 401, description: 'Token ausente o inválido.' })
    catalogo() {
        return this.service.catalogo();
    }

    @Post('comms-capabilities/apply-template')
    @UseGuards(CommsCapabilityGuard)
    @RequireCapability('CFG_PERMISOS')
    @ApiOperation({
        summary: 'Aplicar la plantilla de capacidades a Admin y RH',
        description: 'Solo si el tenant todavía no tiene ninguna capacidad asignada.',
    })
    @ApiResponse({ status: 201, description: 'Plantilla aplicada.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD: el rol no puede asignar permisos.' })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO: el tenant ya tiene configuración o faltan roles.' })
    aplicarPlantilla(@GetActiveUser() activeUser: ActiveUserDto) {
        return this.service.aplicarPlantilla(activeUser);
    }

    @Get(':idRol/comms-capabilities')
    @UseGuards(CommsCapabilityGuard)
    @RequireCapability('CFG_PERMISOS')
    @ApiOperation({
        summary: 'Capacidades de comunicación de un rol',
        description: SWAGGER_AUTH_DESCRIPTION,
    })
    @ApiResponse({ status: 200, description: 'Capacidades del rol.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD: el rol no puede asignar permisos.' })
    @ApiResponse({ status: 404, description: 'El rol no existe en este tenant.' })
    deRol(@GetActiveUser() activeUser: ActiveUserDto, @Param('idRol', ParseIntPipe) idRol: number) {
        return this.service.deRol(activeUser, idRol);
    }

    @Put(':idRol/comms-capabilities')
    @UseGuards(CommsCapabilityGuard)
    @RequireCapability('CFG_PERMISOS')
    @ApiOperation({
        summary: 'Reemplazar las capacidades de comunicación de un rol',
        description: 'Sustituye el conjunto completo. El alcance y las referencias tienen que coincidir.',
    })
    @ApiResponse({ status: 200, description: 'Capacidades actualizadas.' })
    @ApiResponse({ status: 400, description: 'CONTENIDO_INVALIDO: alcance, referencias o tipos incoherentes.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD o FUERA_DE_ALCANCE.' })
    @ApiResponse({ status: 404, description: 'El rol no existe en este tenant.' })
    reemplazar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('idRol', ParseIntPipe) idRol: number,
        @Body() dto: ReemplazarCapacidadesDto,
    ) {
        return this.service.reemplazar(activeUser, idRol, dto);
    }
}
