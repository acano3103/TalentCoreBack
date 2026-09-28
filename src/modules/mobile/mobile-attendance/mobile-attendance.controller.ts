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
import {
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { HistoryQueryDto } from './dto/history-query.dto';
import { MobileCheckDto } from './dto/mobile-check.dto';
import { SyncAttendanceDto } from './dto/sync-attendance.dto';
import { UploadEvidenceDto } from './dto/upload-evidence.dto';
import { MobileAttendanceService, MobileAttendanceUser } from './mobile-attendance.service';

const TAMANIO_MAX_SELFIE = 3 * 1024 * 1024;
const MIME_SELFIE = ['image/jpeg', 'image/png'];

@ApiTags('Mobile Attendance')
@Controller('mobile/attendance')
export class MobileAttendanceController {
    constructor(private readonly mobileAttendanceService: MobileAttendanceService) {}

    @Get('server-time')
    @ApiOperation({
        summary: 'Hora del servidor',
        description: 'Público. La app lo llama antes de autenticarse para calcular el desfase de su reloj.',
    })
    @ApiResponse({ status: 200, description: 'Hora del servidor en ISO-8601 con offset' })
    serverTime() {
        return this.mobileAttendanceService.serverTime();
    }

    @Get('bootstrap')
    @UseGuards(MobileJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Paquete de arranque de asistencia',
        description: 'Empleado, dispositivo, reglas, geocercas y horario. La identidad sale del JWT móvil.',
    })
    @ApiResponse({ status: 200, description: 'Paquete de arranque' })
    @ApiResponse({ status: 401, description: 'Token móvil inválido o expirado' })
    bootstrap(@GetActiveUser() user: MobileAttendanceUser) {
        return this.mobileAttendanceService.bootstrap(user);
    }

    @Get('today')
    @UseGuards(MobileJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Jornada de hoy en la fecha local del sitio',
        description: 'Estado, marcajes y acción siguiente. La identidad sale del JWT móvil.',
    })
    @ApiResponse({ status: 200, description: 'Estado de la jornada de hoy' })
    @ApiResponse({ status: 401, description: 'Token móvil inválido o expirado' })
    today(@GetActiveUser() user: MobileAttendanceUser) {
        return this.mobileAttendanceService.today(user);
    }

    @Get('history')
    @UseGuards(MobileJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Historial de jornadas del colaborador',
        description: 'Default: últimos 30 días locales. Máximo 90 días por consulta. La identidad sale del JWT móvil.',
    })
    @ApiResponse({ status: 200, description: 'Historial de jornadas' })
    @ApiResponse({ status: 400, description: 'Rango de fechas inválido o mayor a 90 días' })
    @ApiResponse({ status: 401, description: 'Token móvil inválido o expirado' })
    history(
        @GetActiveUser() user: MobileAttendanceUser,
        @Query() query: HistoryQueryDto,
    ) {
        return this.mobileAttendanceService.history(user, query.from, query.to);
    }

    @Post('evidence')
    @UseGuards(MobileJwtAuthGuard)
    @ApiBearerAuth()
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
                            message: 'La selfie debe ser una imagen JPG o PNG.',
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
    @ApiBody({ type: UploadEvidenceDto })
    @ApiOperation({
        summary: 'Subir selfie de evidencia',
        description:
            'D6: la selfie se sube primero y el check solo manda idEvidencia. El archivo no se sirve por estáticos; se lee vía MediaController.',
    })
    @ApiResponse({ status: 200, description: 'Evidencia guardada, aún no consumida' })
    @ApiResponse({ status: 400, description: 'El archivo no es JPEG ni PNG' })
    @ApiResponse({ status: 413, description: 'El archivo supera 3 MB' })
    uploadEvidence(
        @GetActiveUser() user: MobileAttendanceUser,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.mobileAttendanceService.uploadEvidence(user, file);
    }

    @Post('check')
    @HttpCode(HttpStatus.OK)
    @UseGuards(MobileJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Registrar checada móvil',
        description:
            'Resuelve el dispositivo, mapea a CanonicalCheck y delega al motor. Un uuidCliente repetido responde 200 con duplicado.',
    })
    @ApiResponse({ status: 200, description: 'Checada aceptada o duplicado idempotente' })
    @ApiResponse({ status: 400, description: 'EVIDENCIA_REQUERIDA o MOTIVO_REQUERIDO' })
    @ApiResponse({ status: 403, description: 'DISPOSITIVO_NO_APROBADO' })
    @ApiResponse({ status: 409, description: 'TRANSICION_INVALIDA' })
    @ApiResponse({ status: 422, description: 'GEOCERCA_BLOQUEADA o JORNADA_CERRADA' })
    check(
        @GetActiveUser() user: MobileAttendanceUser,
        @Body() dto: MobileCheckDto,
    ) {
        return this.mobileAttendanceService.check(user, dto);
    }

    @Post('sync')
    @HttpCode(HttpStatus.OK)
    @UseGuards(MobileJwtAuthGuard)
    @ApiBearerAuth()
    @ApiBody({ type: SyncAttendanceDto })
    @ApiOperation({
        summary: 'Sincronizar lote de checadas offline',
        description:
            'D5: ordena por fechaHoraRegistro ASC y procesa en secuencia. Éxito parcial permitido; reintentable indica si el cliente debe reencolar.',
    })
    @ApiResponse({ status: 200, description: 'Lote procesado (éxito parcial permitido)' })
    @ApiResponse({ status: 400, description: 'Lote vacío, >50 items o item inválido' })
    @ApiResponse({ status: 403, description: 'DISPOSITIVO_NO_APROBADO' })
    sync(
        @GetActiveUser() user: MobileAttendanceUser,
        @Body() dto: SyncAttendanceDto,
    ) {
        return this.mobileAttendanceService.sync(user, dto);
    }
}
