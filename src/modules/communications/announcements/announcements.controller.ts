import {
    ArgumentsHost,
    Body,
    Catch,
    Controller,
    Delete,
    ExceptionFilter,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    UploadedFile,
    UseFilters,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CommsCapabilityGuard } from '../capabilities/comms-capability.guard';
import { RequireCapability } from '../capabilities/require-capability.decorator';
import { MAX_ADJUNTO_BYTES, MAX_PORTADA_BYTES } from './adjuntos';
import { AnnouncementsService } from './announcements.service';
import { ProgramarComunicadoDto } from '../delivery/dto/programar-comunicado.dto';
import { ActualizarComunicadoDto, CrearComunicadoDto, NuevaVersionDto } from './dto/comunicado.dto';
import { KpisQuery, ListarComunicadosQuery } from './dto/listar-comunicados.query';

@Catch()
class FiltroCargaComms implements ExceptionFilter {
    private readonly base = new HttpExceptionFilter();

    catch(exception: unknown, host: ArgumentsHost): void {
        if (!esLimiteMulter(exception)) {
            this.base.catch(exception, host);
            return;
        }
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest<{ url?: string }>();
        response.status(HttpStatus.BAD_REQUEST).json({
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            timestamp: new Date().toISOString(),
            path: request.url,
            code: 'ADJUNTO_INVALIDO',
            message: 'El archivo supera el tamaño permitido.',
        });
    }
}

@ApiTags('Comunicación interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard, CommsCapabilityGuard)
@UseFilters(FiltroCargaComms)
@RequireCapability('COM_CREAR')
@Controller('companies/:companyId/comms')
export class AnnouncementsController {
    constructor(private readonly service: AnnouncementsService) {}

    @Get('announcement-types')
    @ApiOperation({ summary: 'Tipos de comunicado', description: 'Incluye si el rol puede usar cada tipo.' })
    @ApiResponse({ status: 200, description: 'Catálogo del tenant.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD.' })
    tipos(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.service.tipos(activeUser, companyId);
    }

    @Get('announcements/kpis')
    @ApiOperation({ summary: 'Indicadores del mes', description: 'Cuenta los comunicados visibles para quien publica.' })
    @ApiResponse({ status: 200, description: 'Conteos por estado y enviados en el mes.' })
    kpis(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: KpisQuery,
    ) {
        return this.service.kpis(activeUser, companyId, query.mes);
    }

    @Get('announcements')
    @ApiOperation({
        summary: 'Listar comunicados',
        description: 'Quien publica ve los suyos. Con COM_VER_ANALITICA también ve los de su alcance.',
    })
    @ApiResponse({ status: 200, description: 'Página de comunicados.' })
    @ApiResponse({ status: 401, description: SWAGGER_AUTH_DESCRIPTION })
    listar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: ListarComunicadosQuery,
    ) {
        return this.service.listar(activeUser, companyId, query);
    }

    @Post('announcements')
    @ApiOperation({
        summary: 'Crear un borrador',
        description: 'Crea la versión 1 y aplica los valores por defecto del tipo. No envía ni congela destinatarios.',
    })
    @ApiResponse({ status: 201, description: 'Borrador creado.' })
    @ApiResponse({ status: 400, description: 'CONTENIDO_INVALIDO.' })
    @ApiResponse({ status: 403, description: 'TIPO_NO_PERMITIDO, PRIORIDAD_NO_PERMITIDA o SIN_CAPACIDAD.' })
    crear(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: CrearComunicadoDto,
    ) {
        return this.service.crear(activeUser, companyId, dto);
    }

    @Get('announcements/:id')
    @ApiOperation({ summary: 'Detalle de un comunicado', description: 'Versión vigente, adjuntos con URL firmada y opciones.' })
    @ApiResponse({ status: 200, description: 'Comunicado.' })
    @ApiResponse({ status: 404, description: 'No existe o está fuera de tu alcance.' })
    detalle(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.detalle(activeUser, companyId, id);
    }

    @Patch('announcements/:id')
    @ApiOperation({ summary: 'Editar un borrador o un programado', description: 'Actualiza la versión vigente. No crea otra versión.' })
    @ApiResponse({ status: 200, description: 'Comunicado actualizado.' })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO.' })
    actualizar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ActualizarComunicadoDto,
    ) {
        return this.service.actualizar(activeUser, companyId, id, dto);
    }

    @Post('announcements/:id/attachments')
    @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_ADJUNTO_BYTES } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } } } })
    @ApiOperation({ summary: 'Agregar un adjunto', description: 'Hasta 5 archivos, PDF o imagen, de 20 MB. Un aviso operativo admite 2 MB.' })
    @ApiResponse({ status: 201, description: 'Adjunto guardado.' })
    @ApiResponse({ status: 400, description: 'ADJUNTO_INVALIDO.' })
    adjunto(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() archivo: Express.Multer.File,
    ) {
        return this.service.agregarAdjunto(activeUser, companyId, id, archivo);
    }

    @Delete('announcements/:id/attachments/:attachmentId')
    @ApiOperation({ summary: 'Quitar un adjunto', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Adjunto quitado.' })
    @ApiResponse({ status: 404, description: 'No existe en la versión vigente.' })
    quitarAdjunto(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('attachmentId', ParseIntPipe) attachmentId: number,
    ) {
        return this.service.quitarAdjunto(activeUser, companyId, id, attachmentId);
    }

    @Post('announcements/:id/cover')
    @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_PORTADA_BYTES } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } } } })
    @ApiOperation({ summary: 'Cambiar la portada', description: 'JPG, PNG o WebP de hasta 10 MB.' })
    @ApiResponse({ status: 201, description: 'Portada guardada.' })
    @ApiResponse({ status: 400, description: 'ADJUNTO_INVALIDO.' })
    portada(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() archivo: Express.Multer.File,
    ) {
        return this.service.portada(activeUser, companyId, id, archivo);
    }

    @Get('announcements/:id/review')
    @ApiOperation({
        summary: 'Checklist antes de enviar',
        description: 'Audiencia, personas sin canal, plantilla de WhatsApp, vigencia y contenido. El tope de WhatsApp queda en null hasta CA11.',
    })
    @ApiResponse({ status: 200, description: 'Checklist. No envía el comunicado.' })
    revision(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.revision(activeUser, companyId, id);
    }

    @Post('announcements/:id/versions')
    @ApiOperation({
        summary: 'Corregir un comunicado enviado',
        description: 'La corrección menor actualiza la versión vigente. La mayor crea la siguiente y, si hay acuse, regresa las confirmaciones a pendiente.',
    })
    @ApiResponse({ status: 201, description: 'Versión actualizada.' })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO.' })
    version(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: NuevaVersionDto,
    ) {
        return this.service.nuevaVersion(activeUser, companyId, id, dto);
    }

    @Post('announcements/:id/archive')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Archivar un comunicado', description: 'No se borra. Deja de estar activo.' })
    @ApiResponse({ status: 200, description: 'Comunicado archivado.' })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO.' })
    archivar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.archivar(activeUser, companyId, id);
    }

    @Post('announcements/:id/duplicate')
    @ApiOperation({ summary: 'Duplicar un comunicado', description: 'Crea un borrador nuevo con el contenido de la versión vigente.' })
    @ApiResponse({ status: 201, description: 'Borrador duplicado.' })
    duplicar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.duplicar(activeUser, companyId, id);
    }

    @Post('announcements/:id/cancel')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cancelar un comunicado programado', description: 'Solo aplica si todavía no se envió.' })
    @ApiResponse({ status: 200, description: 'Programación cancelada.' })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO.' })
    cancelar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.cancelar(activeUser, companyId, id);
    }

    @Post('announcements/:id/send')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Enviar un comunicado',
        description: 'Congela la audiencia y encola la entrega por canal. Repetir el envío no duplica destinatarios.',
    })
    @ApiResponse({ status: 200, description: 'Envío aceptado o ya realizado.' })
    @ApiResponse({ status: 400, description: 'AUDIENCIA_VACIA o CONTENIDO_INVALIDO.' })
    @ApiResponse({ status: 403, description: 'PRIORIDAD_NO_PERMITIDA o FUERA_DE_ALCANCE.' })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO o PLANTILLA_WA_NO_CONFIGURADA.' })
    enviar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.enviar(activeUser, companyId, id);
    }

    @Post('announcements/:id/schedule')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Programar el envío',
        description: 'Valida el comunicado y deja un trabajo para la fecha indicada. Cancelarlo quita ese trabajo.',
    })
    @ApiResponse({ status: 200, description: 'Quedó programado.' })
    @ApiResponse({ status: 400, description: 'Fecha inválida, audiencia vacía o contenido incompleto.' })
    @ApiResponse({ status: 409, description: 'ESTADO_INVALIDO o PLANTILLA_WA_NO_CONFIGURADA.' })
    programar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ProgramarComunicadoDto,
    ) {
        return this.service.programar(activeUser, companyId, id, dto);
    }
}

function esLimiteMulter(exception: unknown): boolean {
    return typeof exception === 'object' && exception !== null && 'code' in exception && (exception as { code?: string }).code === 'LIMIT_FILE_SIZE';
}
