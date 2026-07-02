import {
    Injectable,
    NotFoundException,
    InternalServerErrorException,
    Logger,
    BadRequestException
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { ValidatePositionDto } from './dto/approve-reject.dto';
import { PositionQueries } from './queries/positions.queries';
import * as fs from 'fs';
import * as path from 'path';
import { calculatePercentage, getScoreTrafficLight } from './utils/formatters.util';
import { ConfigService } from '@nestjs/config';
import { CreatePositionDto } from './dto/create-position.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreatePositionRequestDto } from './dto/create-position-request.dto';

@Injectable()
export class PositionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationDispatcher,
        private readonly configService: ConfigService,
    ) { }

    private readonly logger = new Logger(PositionsService.name);

    async findAll(companyId: number, page: number, search: string, limit: number, aprobada: number) {
        const { positions, total } = await PositionQueries.findAll(this.prisma, companyId, search, page, limit, aprobada);

        if ((!positions || positions.length === 0) && page === 1 && !search) {
            return {
                positions: [],
                total: 0,
                currentPage: page,
                totalPages: 1,
            };
        }

        return {
            positions,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }

    async findOne(companyId: number, positionId: number, specific: number) {
        if (specific === 1) {
            const validationData = await PositionQueries.findValidationDetails(this.prisma, positionId);
            return { validationData };
        } else {
            const position = await this.prisma.catPuestos.findFirst({
                where: { idEmpresa: companyId, idPuesto: positionId },
            });
            if (!position) throw new NotFoundException('Puesto no encontrado');

            const languages = await this.prisma.idiomasPuesto.findMany({
                where: { idPuesto: positionId },
            });
            const schedules = await this.prisma.horariosPuesto.findMany({
                where: { idPuesto: positionId },
            });
            const documents = await this.prisma.documentosPuesto.findMany({
                where: { idPuesto: positionId },
            });
            const functions = await this.prisma.funcionesPuesto.findMany({
                where: { idPuesto: positionId },
            });
            const competencies = await this.prisma.competenciasPuesto.findMany({
                where: { idPuesto: positionId },
            });
            const skills = await this.prisma.habilidadesPuesto.findMany({
                where: { idPuesto: positionId },
            });
            const courses = await this.prisma.relPuestoCurso.findMany({
                where: { idPuesto: positionId },
            });

            return { position, languages, schedules, documents, functions, competencies, skills, courses };
        }
    }

    async create(companyId: number, activeUser: ActiveUserDto, dto: CreatePositionDto) {
        const user = await this.prisma.auth_user.findFirst({ where: { id: activeUser.id } });
        if (!user) throw new BadRequestException('Tu usuario actual no existe');

        return await this.prisma.$transaction(async (tx) => {

            const { generalInfo, languages } = dto;

            const nuevoPuesto = await tx.catPuestos.create({
                data: {
                    idEmpresa: companyId,
                    NombrePuesto: generalInfo.nombrePuesto.trim(),
                    idTipoPuesto: Number(generalInfo.idTipoPuesto),
                    idArea: Number(generalInfo.idArea),
                    idTipoContratacion: generalInfo.idTipoContratacion ? Number(generalInfo.idTipoContratacion) : null,
                    idModalidad: Number(generalInfo.idModalidad),
                    idNivelEstudios: generalInfo.idNivelEstudios ? Number(generalInfo.idNivelEstudios) : null,
                    DescripcionPuesto: languages.description || null,
                    IdNivelSalario: generalInfo.idNivelSalario ? Number(generalInfo.idNivelSalario) : null,
                    DisponibilidadViajar: languages?.disponibilidadViajar ? true : false,
                    idJefeInmediato: languages?.idJefeInmediato ? Number(languages.idJefeInmediato) : null,
                    idUsuarioRegistro: user.uuid,
                    FechaRegistro: new Date(),
                    Activo: true,
                    aprobada: false,
                    pendiente: true
                },
            });

            const newPositionId = nuevoPuesto.idPuesto;

            // =========================================================================
            // 2. INSERCIONES DE RELACIONES HIJAS (OPCIONALES CON VALIDACIÓN SECUENCIAL)
            // =========================================================================

            // === RELACIÓN: IDIOMAS REQUERIDOS ===
            if (languages?.idiomas && languages.idiomas.length > 0) {
                await tx.idiomasPuesto.createMany({
                    data: languages.idiomas.map((idIdioma) => ({
                        idPuesto: newPositionId,
                        idIdioma: Number(idIdioma),
                    })),
                });
            }

            // === RELACIÓN: HORARIOS DEL PUESTO ===
            if (dto.schedules?.turnos && dto.schedules.turnos.length > 0) {
                const turnosData = dto.schedules.turnos.flatMap((turno) => {
                    const fechaBase = '1970-01-01';
                    return turno.days.map((dia) => ({
                        idPuesto: newPositionId,
                        DiaSemana: dia,
                        HoraEntrada: new Date(`${fechaBase}T${turno.start}:00Z`),
                        HoraSalida: new Date(`${fechaBase}T${turno.end}:00Z`),
                    }))
                });

                await tx.horariosPuesto.createMany({ data: turnosData });
            }

            // === RELACIÓN: DOCUMENTOS SELECCIONADOS ===
            if (dto.documents?.documentosSeleccionados && dto.documents.documentosSeleccionados.length > 0) {
                await tx.documentosPuesto.createMany({
                    data: dto.documents.documentosSeleccionados.map((doc) => ({
                        idPuesto: newPositionId,
                        idDocumento: doc.idDocumento,
                        esObligatorio: doc.Obligatorio === 1,
                    })),
                });
            }

            // === RELACIÓN: FUNCIONES / ACTIVIDADES CLAVE ===
            if (dto.functions?.actividades && dto.functions.actividades.length > 0) {
                await tx.funcionesPuesto.createMany({
                    data: dto.functions.actividades.map((actividad) => ({
                        idPuesto: newPositionId,
                        Funcion: actividad.trim(),
                    })),
                });
            }

            // === RELACIÓN: COMPETENCIAS CONDUCTUALES ===
            if (dto.competencies?.competencias && dto.competencies.competencias.length > 0) {
                await tx.competenciasPuesto.createMany({
                    data: dto.competencies.competencias.map((competencia) => ({
                        idPuesto: newPositionId,
                        Competencia: competencia.trim(),
                    })),
                });
            }

            // === RELACIÓN: HABILIDADES (DURAS Y BLANDAS UNIFICADAS) ===
            const duras = dto.skills?.duras || [];
            const blandas = dto.skills?.blandas || [];
            const todasLasHabilidades = [
                ...duras.map(h => ({ name: h.name, level: h.level, tipo: "DURA" })),
                ...blandas.map(h => ({ name: h.name, level: h.level, tipo: "BLANDA" }))
            ];

            if (todasLasHabilidades.length > 0) {
                await tx.habilidadesPuesto.createMany({
                    data: todasLasHabilidades.map((hab) => ({
                        idPuesto: newPositionId,
                        Habilidad: hab.name.trim(),
                        Nivel: hab.level,
                        Tipo: hab.tipo,
                    })),
                });
            }

            // === RELACIÓN: PLANES DE CAPACITACIÓN / CURSOS ===
            if (dto.courses?.cursosSeleccionados && dto.courses.cursosSeleccionados.length > 0) {
                await tx.relPuestoCurso.createMany({
                    data: dto.courses.cursosSeleccionados.map((curso) => ({
                        idPuesto: newPositionId,
                        idCurso: curso.idCurso,
                        idTipoCurso: curso.idTipoCourse,
                        activo: true,
                        fechaRegistro: new Date()
                    })),
                });
            }

            return { message: "Puesto creado exitosamente", id: newPositionId };
        }, {
            maxWait: 5000,
            timeout: 20000
        });
    }

    async update(companyId: number, positionId: number, activeUser: ActiveUserDto, data: CreatePositionDto) {
        const user = await this.prisma.auth_user.findFirst({ where: { id: activeUser.id } });
        if (!user) throw new BadRequestException('Tu usuario actual no existe');

        return await this.prisma.$transaction(async (tx) => {
            const { generalInfo, languages } = data;

            const puestoExistente = await tx.catPuestos.findFirst({ where: { idPuesto: positionId, idEmpresa: companyId } });
            if (!puestoExistente) throw new NotFoundException('El puesto solicitado no existe en esta empresa');

            await tx.catPuestos.update({
                where: { idPuesto: positionId },
                data: {
                    NombrePuesto: generalInfo.nombrePuesto.trim(),
                    idTipoPuesto: Number(generalInfo.idTipoPuesto),
                    idArea: Number(generalInfo.idArea),
                    idTipoContratacion: generalInfo.idTipoContratacion ? Number(generalInfo.idTipoContratacion) : null,
                    idModalidad: Number(generalInfo.idModalidad),
                    idNivelEstudios: generalInfo.idNivelEstudios ? Number(generalInfo.idNivelEstudios) : null,
                    DescripcionPuesto: languages.description || null,
                    IdNivelSalario: generalInfo.idNivelSalario ? Number(generalInfo.idNivelSalario) : null,
                    DisponibilidadViajar: languages?.disponibilidadViajar ? true : false,
                    idJefeInmediato: languages?.idJefeInmediato ? Number(languages.idJefeInmediato) : null,
                    idUsuarioRegistro: user.uuid,
                }
            });

            // =========================================================================
            // APLICACIÓN DE LA ESTRATEGIA A: BORRADO Y REINSERCIÓN DE RELACIONES HIJAS
            // =========================================================================

            // === RELACIÓN: IDIOMAS REQUERIDOS ===
            await tx.idiomasPuesto.deleteMany({ where: { idPuesto: positionId } });
            if (languages?.idiomas && languages.idiomas.length > 0) {
                await tx.idiomasPuesto.createMany({
                    data: languages.idiomas.map((idIdioma) => ({
                        idPuesto: positionId,
                        idIdioma: Number(idIdioma),
                    })),
                });
            }

            // === RELACIÓN: HORARIOS DEL PUESTO ===
            await tx.horariosPuesto.deleteMany({ where: { idPuesto: positionId } });
            if (data.schedules?.turnos && data.schedules.turnos.length > 0) {
                const turnosData = data.schedules.turnos.flatMap((turno) => {
                    const fechaBase = '1970-01-01';
                    return turno.days.map((dia) => ({
                        idPuesto: positionId,
                        DiaSemana: dia,
                        HoraEntrada: new Date(`${fechaBase}T${turno.start}:00Z`),
                        HoraSalida: new Date(`${fechaBase}T${turno.end}:00Z`),
                    }));
                });
                await tx.horariosPuesto.createMany({ data: turnosData });
            }

            // === RELACIÓN: DOCUMENTOS SELECCIONADOS ===
            await tx.documentosPuesto.deleteMany({ where: { idPuesto: positionId } });
            if (data.documents?.documentosSeleccionados && data.documents.documentosSeleccionados.length > 0) {
                await tx.documentosPuesto.createMany({
                    data: data.documents.documentosSeleccionados.map((doc) => ({
                        idPuesto: positionId,
                        idDocumento: doc.idDocumento,
                        esObligatorio: doc.Obligatorio === 1,
                    })),
                });
            }

            // === RELACIÓN: FUNCIONES / ACTIVIDADES CLAVE ===
            await tx.funcionesPuesto.deleteMany({ where: { idPuesto: positionId } });
            if (data.functions?.actividades && data.functions.actividades.length > 0) {
                await tx.funcionesPuesto.createMany({
                    data: data.functions.actividades.map((actividad) => ({
                        idPuesto: positionId,
                        Funcion: actividad.trim(),
                    })),
                });
            }

            // === RELACIÓN: COMPETENCIAS CONDUCTUALES ===
            await tx.competenciasPuesto.deleteMany({ where: { idPuesto: positionId } });
            if (data.competencies?.competencias && data.competencies.competencias.length > 0) {
                await tx.competenciasPuesto.createMany({
                    data: data.competencies.competencias.map((competencia) => ({
                        idPuesto: positionId,
                        Competencia: competencia.trim(),
                    })),
                });
            }

            // === RELACIÓN: HABILIDADES (DURAS Y BLANDAS UNIFICADAS) ===
            await tx.habilidadesPuesto.deleteMany({ where: { idPuesto: positionId } });
            const duras = data.skills?.duras || [];
            const blandas = data.skills?.blandas || [];
            const todasLasHabilidades = [
                ...duras.map(h => ({ name: h.name, level: h.level, tipo: "DURA" })),
                ...blandas.map(h => ({ name: h.name, level: h.level, tipo: "BLANDA" }))
            ];
            if (todasLasHabilidades.length > 0) {
                await tx.habilidadesPuesto.createMany({
                    data: todasLasHabilidades.map((hab) => ({
                        idPuesto: positionId,
                        Habilidad: hab.name.trim(),
                        Nivel: hab.level,
                        Tipo: hab.tipo,
                    })),
                });
            }

            // === RELACIÓN: PLANES DE CAPACITACIÓN / CURSOS ===
            await tx.relPuestoCurso.deleteMany({ where: { idPuesto: positionId } });
            if (data.courses?.cursosSeleccionados && data.courses.cursosSeleccionados.length > 0) {
                await tx.relPuestoCurso.createMany({
                    data: data.courses.cursosSeleccionados.map((curso) => ({
                        idPuesto: positionId,
                        idCurso: curso.idCurso,
                        idTipoCurso: curso.idTipoCourse,
                        activo: true,
                        fechaRegistro: new Date()
                    })),
                });
            }

            return { message: "Puesto actualizado exitosamente" };
        }, {
            maxWait: 5000,
            timeout: 20000
        });
    }

    async changeStatus(companyId: number, id: number, active: boolean) {
        const positionExists = await this.prisma.catPuestos.findFirst({
            where: {
                idPuesto: id,
                idEmpresa: companyId,
            },
        });

        if (!positionExists) throw new NotFoundException(`No se encontró el puesto con ID ${id} para la empresa.`);

        await this.prisma.catPuestos.update({
            where: { idPuesto: id, idEmpresa: companyId },
            data: {
                Activo: active
            },
        });

        return {
            message: active ? 'Puesto activado correctamente' : 'Puesto desactivado correctamente'
        };
    }

    async getCatalogs(companyId: number) {
        const areas = await this.prisma.catAreas.findMany({
            where: { Activo: true },
        });

        const positionTypes = await this.prisma.catTipoPuesto.findMany({
            where: { Activo: true },
        });

        const modalities = await this.prisma.catModalidad.findMany({
            where: { Activo: true },
        });

        const educationLevels = await this.prisma.catEscolaridad.findMany({
            where: { Activo: true },
        });

        const hiringTypes = await this.prisma.catTipoContratacion.findMany({
            where: { Activo: true },
        });

        const salaryLevels = await this.prisma.catNivelesSalario.findMany({
            where: { Activo: true },
        });

        const languages = await this.prisma.catIdiomas.findMany({
            where: { Activo: true },
        });

        const positions = await this.prisma.catPuestos.findMany({
            where: { Activo: true, aprobada: true },
            select: { idPuesto: true, NombrePuesto: true, DescripcionPuesto: true }
        });

        const documents = await this.prisma.catDocumentos.findMany({
            where: { Activo: true },
        });

        const courseTypes = await this.prisma.catTipoCurso.findMany({
            where: { activo: true },
        });

        const courses = await this.prisma.catCursos.findMany({
            where: { activo: true },
        });

        return { areas, positionTypes, modalities, educationLevels, hiringTypes, salaryLevels, languages, positions, documents, courseTypes, courses };
    }

    async approveOrReject(companyId: number, positionId: number, dto: ValidatePositionDto) {
        try {
            const position = await PositionQueries.getPositionInfo(this.prisma, positionId);
            if (!position) throw new NotFoundException('No se encontró el puesto');

            const { positionName, email, phone, userUuid, name } = position;
            const comment = dto.comment || '';
            const action = dto.action;
            const subject = action === 'aprobar' ? '✅ Puesto Aprobado - TalentCore' : '❌ Puesto Rechazado - TalentCore';

            if (action === 'aprobar') {
                await PositionQueries.approvePosition(this.prisma, positionId, comment);
            } else {
                await PositionQueries.rejectPosition(this.prisma, positionId, comment);
            }

            await this.notifications.notify({
                userUuid: userUuid,
                notificationTypeCode: 'POSITION_STATUS_UPDATE',
                to: email,
                phone: phone,
                subject: subject,
                context: {
                    name,
                    positionName,
                    comment,
                    action,
                    isApproved: action === 'aprobar'
                }
            });

            return { message: `Requisición ${action == 'aprobar' ? 'aprobada' : 'rechazada'} correctamente` };

        } catch (error) {
            this.logger.error('Error en aprobar/rechazar puesto:', error);
            throw new InternalServerErrorException(error.message);
        }
    }

    async createRequest(companyId: number, activeUser: ActiveUserDto, dto: CreatePositionRequestDto) {
        await this.prisma.$transaction(async (tx) => {
            const newRequest = await tx.solicitudPuesto.create({
                data: {
                    idEmpresa: companyId,
                    idUsuarioSolicita: activeUser.id,
                    descripcion: dto.description,
                    estatusId: 1,
                    fechaCreacion: new Date(),
                    fechaActualizacion: new Date(),
                }
            });
            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: companyId,
                    accion: 'CREAR',
                    tablaOrigen: 'SolicitudPuesto',
                    idRegistro: newRequest.id,
                    descripcion: `Solicitud de puesto creada por ${activeUser.first_name} ${activeUser.last_name}`,
                    fechaCreacion: new Date()
                }
            });
            return { message: 'Solicitud creada exitosamente' };
        });
    }

    async findAllRequests(
        companyId: number,
        activeUser: ActiveUserDto,
        page: number,
        limit: number,
        filterByUser: number,
        estatusId?: number,
        search?: string
    ) {
        const offset = (page - 1) * limit;

        const whereConditions: any = {
            idEmpresa: companyId,
            idUsuarioSolicita: activeUser.id
        };

        if (filterByUser === 1) {
            whereConditions.idUsuarioSolicita = activeUser.id;
        }

        if (estatusId) {
            whereConditions.estatusId = Number(estatusId);
        }

        if (search && search.trim() !== '') {
            whereConditions.descripcion = {
                contains: search,
            };
        }

        const [requests, totalItems] = await Promise.all([
            this.prisma.solicitudPuesto.findMany({
                where: whereConditions,
                skip: offset,
                take: limit,
                orderBy: {
                    fechaCreacion: 'desc',
                },
                include: {
                    CatEstatusSolicitudPuesto: {
                        select: {
                            id: true,
                            descripcion: true,
                        }
                    },
                    auth_user: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            username: true,
                            email: true,
                            phone: true,
                        }
                    }

                }
            }),
            this.prisma.solicitudPuesto.count({
                where: whereConditions,
            }),
        ]);

        return {
            data: requests,
            total: totalItems,
            currentPage: page,
            totalPages: Math.ceil(totalItems / limit),
        };
    }

    async getRequestsStatus(companyId: number) {
        const requestsStatus = await this.prisma.catEstatusSolicitudPuesto.findMany({
            where: { activo: true },
        });
        return requestsStatus;
    }

    async deleteRequest(companyId: number, requestId: number, activeUser: ActiveUserDto) {
        await this.prisma.$transaction(async (tx) => {
            const request = await tx.solicitudPuesto.findUnique({
                where: { id: requestId },
            });
            if (!request) throw new NotFoundException('No se encontró la solicitud');

            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: companyId,
                    accion: 'ELIMINAR',
                    tablaOrigen: 'SolicitudPuesto',
                    idRegistro: requestId,
                    descripcion: `Solicitud de puesto eliminada por ${activeUser.first_name} ${activeUser.last_name}`,
                    fechaCreacion: new Date()
                }
            });

            await tx.solicitudPuesto.delete({
                where: { id: requestId },
            });
            return { message: 'Solicitud eliminada exitosamente' };
        });
    }







    // Endpoint de la version vieja, eliminar cuando el modulo de reclutamiento este completo y ya no se usen

    async findAllPositions(companyId: number, status?: string) {
        try {
            const rows = await PositionQueries.getActivePositions(this.prisma, Number(companyId)) as any[];

            const puestos = rows.map((p) => {
                return {
                    idPuesto: typeof p.idPuesto === 'bigint' ? Number(p.idPuesto) : p.idPuesto,
                    NombrePuesto: p.NombrePuesto,
                    DescripcionPuesto: p.DescripcionPuesto,
                    SalarioMinimo: p.SalarioMinimo ? String(p.SalarioMinimo) : null,
                    SalarioMaximo: p.SalarioMaximo ? String(p.SalarioMaximo) : null,
                    Vacantes: p.Vacantes ? Number(p.Vacantes) : 0,
                    Edad: p.Edad ? String(p.Edad) : null,
                    Area: p.Area,
                    TipoPuesto: p.TipoPuesto,
                    TipoContratacion: p.TipoContratacion,
                    Modalidad: p.Modalidad,
                    Escolaridad: p.Escolaridad,
                    Site: p.Site,
                    TotalCVs: p.TotalCVs ? Number(p.TotalCVs) : 0,
                    TotalAprobados: p.TotalAprobados ? Number(p.TotalAprobados) : 0,
                    TotalRechazados: p.TotalRechazados ? Number(p.TotalRechazados) : 0,
                };
            });

            return puestos;

        } catch (error) {
            console.error('Error al obtener posiciones activas con métricas:', error);
            throw new InternalServerErrorException('Error al procesar las vacantes');
        }
    }

    async findPositionById(companyId: number, positionId: number) {
        return this.prisma.catPuestos.findFirst({
            where: {
                idPuesto: positionId,
                Activo: true
            }
        })
    }

    async getPostulantsSummary(idPuesto: number) {
        const CV_DEFAULT = "https://fileonline.datavoice.com.mx/RR-HH/media/GRUS990820HDFVRC07/documento_1_GRUS990820HDFVRC07.pdf";
        const mediaPrefixRaw = this.configService.get<string>('MEDIA_PATH_PREFIX') || 'media';
        const mediaPrefix = mediaPrefixRaw.replace(/^\/+|\/+$/g, '');

        try {
            const rows = await PositionQueries.getPostulantsSummary(this.prisma, Number(idPuesto)) as any[];

            const postulantes = rows.map((p) => {
                let indices = p.indices ? (typeof p.indices === 'string' ? JSON.parse(p.indices) : p.indices) : {};
                if (indices && Object.keys(indices).length > 0) {
                    indices['indice_ajuste_tecnico'] = calculatePercentage(indices['indice_ajuste_tecnico']);
                    indices['indice_ajuste_competencial'] = calculatePercentage(indices['indice_ajuste_competencial']);
                }

                let categorias = p.detalle_por_categoria
                    ? (typeof p.detalle_por_categoria === 'string' ? JSON.parse(p.detalle_por_categoria) : p.detalle_por_categoria)
                    : [];

                if (Array.isArray(categorias)) {
                    categorias = categorias.map((c: any) => {
                        const { peso, justificacion, score_ponderado, ...rest } = c;
                        return {
                            ...rest,
                            porcentaje_cumplimiento: calculatePercentage(c.porcentaje_cumplimiento),
                        };
                    });
                }

                let finalRutaCV = CV_DEFAULT;
                if (p.rutaCV) {
                    const rootPath = path.join(process.cwd(), 'media');
                    const rutaFisica = path.join(rootPath, p.rutaCV);
                    if (fs.existsSync(rutaFisica)) {
                        finalRutaCV = p.rutaCV.startsWith('http') ? p.rutaCV : `/${mediaPrefix}/${p.rutaCV}`;
                    }
                }

                return {
                    ...p,
                    idPostulacion: typeof p.idPostulacion === 'bigint' ? Number(p.idPostulacion) : p.idPostulacion,
                    indices,
                    detalle_por_categoria: categorias,
                    rutaCV: finalRutaCV,
                    semaforo_global: getScoreTrafficLight(Number(p.score_global)),
                };
            });

            return { postulantes };

        } catch (error) {
            console.error('Error en servicio:', error);
            throw new InternalServerErrorException('Error al procesar postulantes');
        }
    }
}