import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { RegisterActivityDto } from 'src/modules/courses/learning/dto/register-activity.dto';
import { SubmitLessonProgressDto } from 'src/modules/courses/learning/dto/submit-lesson-progress.dto';
import { CourseMaterialsService } from 'src/modules/courses/materials/course-materials.service';
import { CommitScormDto } from 'src/modules/courses/scorm/dto/commit-scorm.dto';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { relanzarSiNoAsignado } from './curso-no-asignado';
import { FiltroCursosQuery } from './dto/filtro-cursos.query';
import { MobileTrainingService } from './mobile-training.service';
import { MobileScormPlayService } from './scorm/mobile-scorm-play.service';

@ApiTags('Mobile Training')
@ApiBearerAuth()
@UseGuards(MobileJwtAuthGuard, CompanyTenantGuard)
@Controller('mobile/companies/:companyId/training/courses')
export class MobileTrainingController {
    constructor(
        private readonly training: MobileTrainingService,
        private readonly materials: CourseMaterialsService,
        private readonly play: MobileScormPlayService,
    ) {}

    @Get()
    @ApiOperation({
        summary: 'Cursos del empleado en todas las modalidades',
        description:
            'Asíncronos (SCORM, nativo, IA), presenciales y en línea síncronos. Orden: por vencer, en progreso, pendientes, completados y no realizados. La web sigue listando solo asíncronos.',
    })
    @ApiResponse({ status: 200, description: 'CursoResumen[] con vencimiento, avance y última actividad.' })
    @ApiResponse({ status: 403, description: 'La empresa no pertenece al tenant del token.' })
    @ApiResponse({ status: 404, description: 'El usuario no tiene empleado en esta empresa.' })
    listar(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: FiltroCursosQuery,
        @GetActiveUser() user: ActiveUserDto,
    ) {
        return this.training.listar(companyId, user, query.filtro ?? 'todos');
    }

    @Get(':sessionId')
    @ApiOperation({
        summary: 'Detalle de un curso asignado',
        description:
            'Asíncrono: la misma ficha que my-courses, con numero, materiales, vencimiento y duración estimada. El quiz no trae respuestas. Presencial o síncrono: contenido null y clases completas, con ventana, enlace y si ya pasó lista.',
    })
    @ApiResponse({ status: 200, description: 'Ficha del curso. contenido en asíncrono; clases en presencial y síncrono.' })
    @ApiResponse({ status: 404, description: 'CURSO_NO_ASIGNADO si no está inscrito.' })
    detalle(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @GetActiveUser() user: ActiveUserDto,
    ) {
        return this.training.detalle(companyId, sessionId, user);
    }

    @Post(':sessionId/lessons/:lessonId/progress')
    @ApiOperation({
        summary: 'Guardar el avance de una lección',
        description: 'Delega en el player web y agrega la gamificación ganada con esta acción.',
    })
    @ApiResponse({ status: 201, description: 'Avance guardado.' })
    @ApiResponse({ status: 400, description: 'Quiz inválido, lección bloqueada, curso no disponible o video sin terminar (VIDEO_PENDIENTE).' })
    @ApiResponse({ status: 404, description: 'CURSO_NO_ASIGNADO o la lección no pertenece al curso.' })
    progreso(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Param('lessonId', ParseIntPipe) lessonId: number,
        @Body() dto: SubmitLessonProgressDto,
        @GetActiveUser() user: ActiveUserDto,
    ) {
        return this.training.guardarAvance(companyId, sessionId, lessonId, dto, user);
    }

    @Post(':sessionId/activity')
    @ApiOperation({
        summary: 'Registrar actividad en el curso',
        description:
            'tipo latido, abrir_leccion o video_progreso. video_progreso envía idLeccion, segundosVistos y duracionSegundos (enteros ≥ 0, segundosVistos ≤ duración + 5). Al 90 % marca el video como visto. Delega en el seguimiento del player web.',
    })
    @ApiResponse({ status: 201, description: 'Actividad registrada.' })
    @ApiResponse({ status: 400, description: 'Actividad inválida, lección bloqueada o avance de video fuera de rango.' })
    @ApiResponse({ status: 404, description: 'CURSO_NO_ASIGNADO o la lección no pertenece al curso.' })
    actividad(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Body() dto: RegisterActivityDto,
        @GetActiveUser() user: ActiveUserDto,
    ) {
        return this.training.registrarActividad(companyId, sessionId, dto, user);
    }

    @Get(':sessionId/materials/:archivo')
    @ApiOperation({
        summary: 'Material de apoyo de una lección',
        description:
            'El mismo archivo que my-courses. Content-Type según la extensión, Content-Disposition inline con filename* UTF-8 y Cache-Control private, max-age=300. Exige inscripción.',
    })
    @ApiResponse({ status: 200, description: 'Archivo inline.' })
    @ApiResponse({ status: 404, description: 'CURSO_NO_ASIGNADO o el archivo no pertenece al curso.' })
    async material(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Param('archivo') archivo: string,
        @GetActiveUser() user: ActiveUserDto,
        @Res() res: Response,
    ) {
        try {
            await this.materials.sendForMobileEmployee(companyId, sessionId, archivo, user, res);
        } catch (error) {
            relanzarSiNoAsignado(error);
        }
    }

    @Post(':sessionId/scorm/session')
    @ApiOperation({
        summary: 'Token de lanzamiento SCORM para el WebView',
        description:
            'Valida la inscripción con el mismo lanzamiento de la web y firma un JWT de 4 horas (audiencia scorm-play). La URL no lleva el JWT móvil. Si disponible es false, el launcher no publica commits.',
    })
    @ApiResponse({ status: 201, description: 'urlLanzador, expiraEn, versión, título, disponibilidad y estado para retomar.' })
    @ApiResponse({ status: 404, description: 'CURSO_NO_ASIGNADO si no está inscrito.' })
    async sesionScorm(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @GetActiveUser() user: ActiveUserDto,
    ) {
        try {
            return await this.play.crear(companyId, sessionId, user);
        } catch (error) {
            relanzarSiNoAsignado(error);
        }
    }

    @Post(':sessionId/scorm/commit')
    @ApiOperation({
        summary: 'Guardar el avance SCORM reportado por la app',
        description: 'El mismo cuerpo que la web. Si el estatus del curso cambió, la respuesta incluye la gamificación ganada.',
    })
    @ApiResponse({ status: 201, description: 'ScormCommitResult.' })
    @ApiResponse({ status: 400, description: 'El curso no tiene paquete SCORM o no está disponible.' })
    @ApiResponse({ status: 404, description: 'CURSO_NO_ASIGNADO si no está inscrito.' })
    async commitScorm(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Body() dto: CommitScormDto,
        @GetActiveUser() user: ActiveUserDto,
    ) {
        try {
            return await this.training.commitScorm(companyId, sessionId, dto, user);
        } catch (error) {
            relanzarSiNoAsignado(error);
        }
    }
}
