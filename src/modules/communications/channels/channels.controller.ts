import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CommsCapabilityGuard } from '../capabilities/comms-capability.guard';
import { RequireCapability } from '../capabilities/require-capability.decorator';
import { ChannelsService } from './channels.service';
import { ActualizarChannelConfigDto } from './dto/channel-config.dto';
import { ActualizarExcepcionDto, ExcepcionCanalDto, MatrizCanalesDto } from './dto/channel-profile.dto';

@ApiTags('Comunicación interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard, CommsCapabilityGuard)
@RequireCapability('CFG_CANALES')
@Controller('companies/:companyId/comms')
export class ChannelsController {
    constructor(private readonly service: ChannelsService) {}

    @Get('channel-config')
    @ApiOperation({
        summary: 'Configuración de canales de la empresa',
        description: 'Si todavía no hay fila, se crea con los valores por defecto.',
    })
    @ApiResponse({ status: 200, description: 'Configuración de canales.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD.' })
    obtenerConfig(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.service.obtenerConfig(activeUser, companyId);
    }

    @Put('channel-config')
    @ApiOperation({ summary: 'Actualizar la configuración de canales', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Configuración actualizada.' })
    @ApiResponse({ status: 400, description: 'CONTENIDO_INVALIDO.' })
    actualizarConfig(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: ActualizarChannelConfigDto,
    ) {
        return this.service.actualizarConfig(activeUser, companyId, dto);
    }

    @Get('channel-profiles/exceptions')
    @ApiOperation({ summary: 'Excepciones de canal por persona o ubicación', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Excepciones de la empresa.' })
    excepciones(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.service.excepciones(activeUser, companyId);
    }

    @Post('channel-profiles/exceptions')
    @ApiOperation({ summary: 'Crear una excepción de canal', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Excepción creada.' })
    @ApiResponse({ status: 403, description: 'FUERA_DE_ALCANCE.' })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO: ya existe esa excepción.' })
    crearExcepcion(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: ExcepcionCanalDto,
    ) {
        return this.service.crearExcepcion(activeUser, companyId, dto);
    }

    @Patch('channel-profiles/exceptions/:id')
    @ApiOperation({ summary: 'Editar una excepción de canal', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Excepción actualizada.' })
    @ApiResponse({ status: 404, description: 'No existe en esta empresa.' })
    actualizarExcepcion(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ActualizarExcepcionDto,
    ) {
        return this.service.actualizarExcepcion(activeUser, companyId, id, dto);
    }

    @Delete('channel-profiles/exceptions/:id')
    @ApiOperation({ summary: 'Eliminar una excepción de canal', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Excepción eliminada.' })
    @ApiResponse({ status: 404, description: 'No existe en esta empresa.' })
    eliminarExcepcion(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.eliminarExcepcion(activeUser, companyId, id);
    }

    @Get('channel-profiles')
    @ApiOperation({ summary: 'Perfiles de canal de un nivel', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiQuery({ name: 'nivel', enum: ['TIPO_PERSONAL', 'UBICACION', 'EMPLEADO'] })
    @ApiResponse({ status: 200, description: 'Perfiles del nivel.' })
    perfiles(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('nivel') nivel = '',
    ) {
        return this.service.perfiles(activeUser, companyId, nivel);
    }

    @Put('channel-profiles')
    @ApiOperation({
        summary: 'Reemplazar la matriz de canales por tipo de personal',
        description: 'Sustituye solo el nivel TIPO_PERSONAL. Las excepciones no se tocan.',
    })
    @ApiResponse({ status: 200, description: 'Matriz actualizada.' })
    @ApiResponse({ status: 400, description: 'CONTENIDO_INVALIDO.' })
    reemplazarMatriz(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: MatrizCanalesDto,
    ) {
        return this.service.reemplazarMatriz(activeUser, companyId, dto);
    }

    @Get('employees/:idEmpleado/effective-channels')
    @ApiOperation({ summary: 'Canales efectivos de una persona', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Canales que esa persona puede recibir.' })
    @ApiResponse({ status: 403, description: 'FUERA_DE_ALCANCE.' })
    @ApiResponse({ status: 404, description: 'La persona no existe.' })
    deEmpleado(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('idEmpleado', ParseIntPipe) idEmpleado: number,
    ) {
        return this.service.canalesDeEmpleado(activeUser, companyId, idEmpleado);
    }
}
