import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { MIME_SELFIE, TAMANIO_MAX_SELFIE } from 'src/modules/mobile/mobile-attendance/selfie.constants';
import { KioscoActual } from '../kiosk-auth/decorators/kiosco-actual.decorator';
import { KioskJwtAuthGuard } from '../kiosk-auth/guards/kiosk-jwt-auth.guard';
import { SesionKiosco } from '../kiosk-auth/kiosco-actual';
import {
    ChecadaKioscoDto,
    HeartbeatKioskDto,
    QueryLookupEmpleadoDto,
    QueryRosterDto,
    SubirEvidenciaKioscoDto,
    SyncKioskDto,
} from './dto/kiosk-device.dto';
import { KioskDeviceService } from './kiosk-device.service';

@ApiTags('Kiosk')
@ApiBearerAuth()
@UseGuards(KioskJwtAuthGuard)
@Controller('kiosk')
export class KioskDeviceController {
    constructor(private readonly device: KioskDeviceService) {}

    @Get('bootstrap')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Arranque del equipo',
        description: 'Kiosco, empresa, ubicaciones, políticas del equipo y umbrales globales.',
    })
    @ApiResponse({ status: 200, description: 'Paquete de arranque del kiosco.' })
    @ApiResponse({ status: 403, description: 'El equipo fue desactivado.' })
    bootstrap(@KioscoActual() kiosco: SesionKiosco) {
        return this.device.bootstrap(kiosco);
    }

    @Get('roster')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Padrón del kiosco',
        description: 'Empleados activos de las ubicaciones del equipo. Si la versión coincide, no reenvía la lista.',
    })
    @ApiResponse({ status: 200, description: 'Padrón completo o sin cambios.' })
    @ApiResponse({ status: 403, description: 'El equipo fue desactivado.' })
    roster(@KioscoActual() kiosco: SesionKiosco, @Query() query: QueryRosterDto) {
        return this.device.roster(kiosco, query.version);
    }

    @Get('employees/lookup')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Buscar empleado por número',
        description: 'Lo usa la tablet antes de checar. Los errores no incluyen datos del empleado.',
    })
    @ApiResponse({ status: 200, description: 'Empleado del padrón, con el tipo sugerido y el turno de hoy.' })
    @ApiResponse({ status: 404, description: 'EMPLEADO_NO_ENCONTRADO' })
    @ApiResponse({ status: 409, description: 'EMPLEADO_NO_ASIGNADO o EMPLEADO_INACTIVO' })
    lookup(@KioscoActual() kiosco: SesionKiosco, @Query() query: QueryLookupEmpleadoDto) {
        return this.device.lookup(kiosco, query.numero);
    }

    @Post('heartbeat')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Latido del equipo',
        description: 'Actualiza la última conexión, la versión de la app y las checadas pendientes.',
    })
    @ApiBody({ type: HeartbeatKioskDto })
    @ApiResponse({ status: 200, description: 'Versión del padrón y hora del servidor.' })
    @ApiResponse({ status: 403, description: 'El equipo fue desactivado.' })
    heartbeat(@KioscoActual() kiosco: SesionKiosco, @Body() dto: HeartbeatKioskDto) {
        return this.device.heartbeat(kiosco, dto);
    }

    @Post('evidence')
    @HttpCode(HttpStatus.OK)
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            limits: { fileSize: TAMANIO_MAX_SELFIE },
            fileFilter: (_req, file, callback) => {
                if (!MIME_SELFIE.includes(file.mimetype)) {
                    callback(
                        new BadRequestException({
                            code: 'ARCHIVO_INVALIDO',
                            message: 'La foto debe ser una imagen JPG o PNG.',
                            detail: { mimetype: file.mimetype },
                        }),
                        false,
                    );
                    return;
                }
                callback(null, true);
            },
        }),
    )
    @ApiBody({
        schema: {
            type: 'object',
            required: ['file', 'rostroDetectado'],
            properties: {
                file: { type: 'string', format: 'binary' },
                rostroDetectado: { type: 'string', enum: ['true', 'false'] },
            },
        },
    })
    @ApiOperation({
        summary: 'Subir la foto de la checada',
        description: 'Se guarda antes del check. La app solo la manda si el kiosco exige foto.',
    })
    @ApiResponse({ status: 200, description: 'Foto guardada. Devuelve idEvidencia.' })
    @ApiResponse({ status: 400, description: 'La foto no es JPG ni PNG, o falta rostroDetectado.' })
    @ApiResponse({ status: 413, description: 'La foto supera 3 MB.' })
    evidence(
        @KioscoActual() kiosco: SesionKiosco,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: SubirEvidenciaKioscoDto,
    ) {
        return this.device.subirEvidencia(kiosco, file, dto.rostroDetectado === 'true');
    }

    @Post('check')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Registrar una checada',
        description:
            'Resuelve al empleado, aplica las políticas del equipo y delega al motor. Duplicado y por identificar responden 200.',
    })
    @ApiBody({ type: ChecadaKioscoDto })
    @ApiResponse({ status: 200, description: 'REGISTRADO, DUPLICADO o POR_IDENTIFICAR.' })
    @ApiResponse({ status: 400, description: 'EVIDENCIA_REQUERIDA, SIN_ROSTRO u OFFLINE_NO_PERMITIDO.' })
    @ApiResponse({ status: 404, description: 'EMPLEADO_NO_ENCONTRADO, si el kiosco no acepta incidencias.' })
    @ApiResponse({ status: 409, description: 'EMPLEADO_NO_ASIGNADO, EMPLEADO_INACTIVO o TRANSICION_INVALIDA.' })
    check(@KioscoActual() kiosco: SesionKiosco, @Body() dto: ChecadaKioscoDto) {
        return this.device.check(kiosco, dto);
    }

    @Post('sync')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Sincronizar checadas encoladas',
        description:
            'De 1 a 50 ítems, en orden de fechaHoraRegistro. Un ítem inválido no tumba el lote. Solo se reintenta un fallo de infraestructura.',
    })
    @ApiBody({ type: SyncKioskDto })
    @ApiResponse({ status: 200, description: 'Un resultado por ítem.' })
    @ApiResponse({ status: 400, description: 'El lote está vacío o trae más de 50 ítems.' })
    sync(@KioscoActual() kiosco: SesionKiosco, @Body() dto: SyncKioskDto) {
        return this.device.sync(kiosco, dto);
    }
}
