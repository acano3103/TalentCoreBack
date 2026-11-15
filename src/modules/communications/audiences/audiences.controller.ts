import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CommsCapabilityGuard } from '../capabilities/comms-capability.guard';
import { RequireCapability } from '../capabilities/require-capability.decorator';
import { AudiencesService } from './audiences.service';
import { ActualizarAudienciaDto } from './dto/actualizar-audiencia.dto';
import { CriteriosAudienciaDto } from './dto/criterios-audiencia.dto';
import { GuardarAudienciaDto } from './dto/guardar-audiencia.dto';
import { PreviewRecipientsQueryDto } from './dto/preview-recipients.query';
import { EJEMPLO_PREVIEW } from '../housekeeping/ejemplos-swagger';

@ApiTags('Comunicación interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard, CommsCapabilityGuard)
@Controller('companies/:companyId/comms')
export class AudiencesController {
    constructor(private readonly service: AudiencesService) {}

    @Post('audiences/preview')
    @HttpCode(HttpStatus.OK)
    @RequireCapability('COM_CREAR')
    @ApiOperation({
        summary: 'Vista previa de una audiencia',
        description: 'Resuelve los criterios dentro del alcance y guarda los ids 15 minutos. La audiencia dinámica no se persiste.',
    })
    @ApiResponse({ status: 200, description: 'Conteo, canales, costo estimado y una muestra de 20 personas.', schema: { example: EJEMPLO_PREVIEW } })
    @ApiResponse({ status: 400, description: 'AUDIENCIA_VACIA: la audiencia no incluye a nadie.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD o FUERA_DE_ALCANCE si no queda nadie dentro del alcance.' })
    preview(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: CriteriosAudienciaDto,
    ) {
        return this.service.preview(activeUser, companyId, dto);
    }

    @Get('audiences/preview/recipients')
    @RequireCapability('COM_CREAR')
    @ApiOperation({
        summary: 'Personas de una vista previa',
        description: 'La lista sale de los ids guardados. Sin búsqueda, el total coincide con el de la vista previa.',
    })
    @ApiResponse({ status: 200, description: 'Página de destinatarios.' })
    @ApiResponse({ status: 404, description: 'La vista previa venció o no existe.' })
    destinatarios(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: PreviewRecipientsQueryDto,
    ) {
        return this.service.destinatarios(
            activeUser,
            companyId,
            query.previewId,
            query.page ?? 1,
            query.pageSize ?? 20,
            query.search,
        );
    }

    @Get('audience-options')
    @RequireCapability('COM_CREAR')
    @ApiOperation({
        summary: 'Catálogos para armar una audiencia',
        description: 'Empresas, unidades, ubicaciones, áreas, puestos, etiquetas, tipos, jefes con equipo y campañas, con el conteo dentro del alcance.',
    })
    @ApiResponse({ status: 200, description: 'Opciones filtradas por el alcance de quien publica.' })
    @ApiResponse({ status: 401, description: SWAGGER_AUTH_DESCRIPTION })
    opciones(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.service.opciones(activeUser, companyId);
    }

    @Get('audiences')
    @RequireCapability('COM_CREAR')
    @ApiOperation({ summary: 'Listar audiencias guardadas', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Audiencias activas de la empresa. La dinámica no trae personas congeladas.' })
    listar(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.service.listar(activeUser, companyId);
    }

    @Post('audiences')
    @RequireCapability('AUD_GESTIONAR')
    @ApiOperation({
        summary: 'Guardar una audiencia',
        description: 'DINAMICA guarda los criterios. FIJA congela las personas del momento.',
    })
    @ApiResponse({ status: 201, description: 'Audiencia guardada.' })
    @ApiResponse({ status: 400, description: 'AUDIENCIA_VACIA o CONTENIDO_INVALIDO.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD o FUERA_DE_ALCANCE.' })
    crear(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: GuardarAudienciaDto,
    ) {
        return this.service.crear(activeUser, companyId, dto);
    }

    @Get('audiences/:id')
    @RequireCapability('COM_CREAR')
    @ApiOperation({ summary: 'Detalle de una audiencia guardada', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Audiencia.' })
    @ApiResponse({ status: 404, description: 'No existe en esta empresa.' })
    detalle(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.detalle(activeUser, companyId, id);
    }

    @Patch('audiences/:id')
    @RequireCapability('AUD_GESTIONAR')
    @ApiOperation({ summary: 'Editar una audiencia guardada', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Audiencia actualizada. Si es fija y cambian los criterios, se vuelven a congelar las personas.' })
    @ApiResponse({ status: 403, description: 'FUERA_DE_ALCANCE.' })
    @ApiResponse({ status: 404, description: 'No existe en esta empresa.' })
    actualizar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ActualizarAudienciaDto,
    ) {
        return this.service.actualizar(activeUser, companyId, id, dto);
    }

    @Delete('audiences/:id')
    @RequireCapability('AUD_GESTIONAR')
    @ApiOperation({ summary: 'Archivar una audiencia', description: 'No se borra: deja de listarse y las personas fijas se conservan.' })
    @ApiResponse({ status: 200, description: 'Audiencia archivada.' })
    @ApiResponse({ status: 404, description: 'No existe en esta empresa.' })
    archivar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.archivar(activeUser, companyId, id);
    }
}
