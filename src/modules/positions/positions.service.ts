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
import { calculatePercentage, getScoreTrafficLight } from '../vacancies/utils/formatters.util';
import { ConfigService } from '@nestjs/config';
import { CreatePositionDto } from './dto/create-position.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreatePositionRequestDto } from './dto/create-position-request.dto';
import { ValidatePositionRequestDto } from './dto/approve-reject-reques.dto';
import { IntegrationsFactory } from '../integrations/providers/factory.service';
import * as ExcelJS from 'exceljs';

@Injectable()
export class PositionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationDispatcher,
        private readonly configService: ConfigService,
        private integrationFactory: IntegrationsFactory,
    ) { }

    private readonly logger = new Logger(PositionsService.name);

    async findAll(activeUser: ActiveUserDto, companyId: number, page: number, search: string, limit: number, aprobada: number) {
        const { positions, total } = await PositionQueries.findAll(this.prisma, activeUser.idTenant, companyId, search, page, limit, aprobada);

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

    async findOne(activeUser: ActiveUserDto, companyId: number, positionId: number, specific: number) {
        const position = await this.prisma.catPuestos.findFirst({
            where: { idTenant: activeUser.idTenant, idEmpresa: companyId, idPuesto: positionId },
        });
        if (!position) throw new NotFoundException('El puesto no se encontro o no existe.');

        if (specific === 1) {
            const validationData = await PositionQueries.findValidationDetails(this.prisma, positionId);
            return { validationData };
        } else {
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


    async getSchedule(activeUser: ActiveUserDto, companyId: number, positionId: number) {
        const position = await this.prisma.catPuestos.findFirst({
            where: { idTenant: activeUser.idTenant, idEmpresa: companyId, idPuesto: positionId },
        });
        if (!position) throw new NotFoundException('El puesto no se encontró o no existe.');

        // Ejecutamos ambas consultas en paralelo para optimizar tiempos
        const [horarios, modalidades] = await Promise.all([
            this.prisma.horariosPuesto.findMany({
                where: { idPuesto: positionId },
            }),
            this.prisma.catModalidad.findMany({
                where: { Activo: true },
            }),
        ]);

        // Buscamos cuál modalidad le corresponde al puesto según su idModalidad
        const modalidadPuesto = modalidades.find((m) => m.idModalidad === position.idModalidad);

        // Formateamos las horas a "HH:mm"
        const formatearHora = (fecha: Date | null): string => {
            if (!fecha) return '';
            const d = new Date(fecha);
            const horas = String(d.getUTCHours()).padStart(2, '0');
            const minutos = String(d.getUTCMinutes()).padStart(2, '0');
            return `${horas}:${minutos}`;
        };

        const horariosList = horarios.map((h) => ({
            dia: h.DiaSemana,
            horaEntrada: formatearHora(h.HoraEntrada),
            horaSalida: formatearHora(h.HoraSalida),
        }));

        return {
            modalidadDefault: modalidadPuesto
                ? {
                    idModalidad: modalidadPuesto.idModalidad,
                    descripcion: modalidadPuesto.Descripcion,
                }
                : null,
            modalidades: modalidades.map((m) => ({
                idModalidad: m.idModalidad,
                descripcion: m.Descripcion,
            })),
            horariosList,
        };
    }

    async getRequiredDocuments(activeUser: ActiveUserDto, companyId: number, positionId: number) {
        const position = await this.prisma.catPuestos.findFirst({
            where: { idTenant: activeUser.idTenant, idEmpresa: companyId, idPuesto: positionId },
        });
        if (!position) throw new NotFoundException('El puesto no se encontro o no existe.');

        const docsPuesto = await this.prisma.documentosPuesto.findMany({
            where: { idPuesto: positionId },
        });
        if (docsPuesto.length === 0) return [];

        const idsDocumento = docsPuesto.map((d) => d.idDocumento);
        const catDocumentos = await this.prisma.catDocumentos.findMany({
            where: { IdDocumento: { in: idsDocumento }, Activo: true },
        });
        const catMap = new Map(catDocumentos.map((c) => [c.IdDocumento, c]));

        return docsPuesto
            .filter((d) => catMap.has(d.idDocumento))
            .map((d) => {
                const cat = catMap.get(d.idDocumento)!;
                return {
                    id: cat.IdDocumento,
                    nombre: cat.Descripcion,
                    obligatorio: !!d.esObligatorio,
                };
            });
    }


    async create(activeUser: ActiveUserDto, companyId: number, dto: CreatePositionDto) {
        const user = await this.prisma.auth_user.findFirst({ where: { id: activeUser.id } });
        if (!user) throw new BadRequestException('Tu usuario actual no existe');

        return await this.prisma.$transaction(async (tx) => {

            const { generalInfo, languages } = dto;

            // Creamos el puesto padre de forma secuencial (Obligatorio para obtener el ID)
            const nuevoPuesto = await tx.catPuestos.create({
                data: {
                    idTenant: activeUser.idTenant,
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

            // INSERCIONES EN PARALELO (OPTIMIZACIÓN CLAVE)
            const dbOperations: Promise<any>[] = [];

            // === RELACIÓN: IDIOMAS REQUERIDOS ===
            if (languages?.idiomas && languages.idiomas.length > 0) {
                dbOperations.push(
                    tx.idiomasPuesto.createMany({
                        data: languages.idiomas.map((idIdioma) => ({
                            idPuesto: newPositionId,
                            idIdioma: Number(idIdioma),
                        })),
                    })
                );
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

                dbOperations.push(tx.horariosPuesto.createMany({ data: turnosData }));
            }

            // === RELACIÓN: DOCUMENTOS SELECCIONADOS ===
            if (dto.documents?.documentosSeleccionados && dto.documents.documentosSeleccionados.length > 0) {
                dbOperations.push(
                    tx.documentosPuesto.createMany({
                        data: dto.documents.documentosSeleccionados.map((doc) => ({
                            idPuesto: newPositionId,
                            idDocumento: doc.idDocumento,
                            esObligatorio: doc.Obligatorio === 1,
                        })),
                    })
                );
            }

            // === RELACIÓN: FUNCIONES / ACTIVIDADES CLAVE ===
            if (dto.functions?.actividades && dto.functions.actividades.length > 0) {
                dbOperations.push(
                    tx.funcionesPuesto.createMany({
                        data: dto.functions.actividades.map((actividad) => ({
                            idPuesto: newPositionId,
                            Funcion: actividad.trim(),
                        })),
                    })
                );
            }

            // === RELACIÓN: COMPETENCIAS CONDUCTUALES ===
            if (dto.competencies?.competencias && dto.competencies.competencias.length > 0) {
                dbOperations.push(
                    tx.competenciasPuesto.createMany({
                        data: dto.competencies.competencias.map((competencia) => ({
                            idPuesto: newPositionId,
                            Competencia: competencia.trim(),
                        })),
                    })
                );
            }

            // === RELACIÓN: HABILIDADES (DURAS Y BLANDAS UNIFICADAS) ===
            const duras = dto.skills?.duras || [];
            const blandas = dto.skills?.blandas || [];
            const todasLasHabilidades = [
                ...duras.map(h => ({ name: h.name, level: h.level, tipo: "DURA" })),
                ...blandas.map(h => ({ name: h.name, level: h.level, tipo: "BLANDA" }))
            ];

            if (todasLasHabilidades.length > 0) {
                dbOperations.push(
                    tx.habilidadesPuesto.createMany({
                        data: todasLasHabilidades.map((hab) => ({
                            idPuesto: newPositionId,
                            Habilidad: hab.name.trim(),
                            Nivel: hab.level,
                            Tipo: hab.tipo,
                        })),
                    })
                );
            }

            // === RELACIÓN: PLANES DE CAPACITACIÓN / CURSOS ===
            if (dto.courses?.cursosSeleccionados && dto.courses.cursosSeleccionados.length > 0) {
                dbOperations.push(
                    tx.relPuestoCurso.createMany({
                        data: dto.courses.cursosSeleccionados.map((curso) => ({
                            idPuesto: newPositionId,
                            idCurso: curso.idCurso,
                            idTipoCurso: curso.idTipoCourse,
                            activo: true,
                            fechaRegistro: new Date()
                        })),
                    })
                );
            }

            // === RELACIÓN: HISTÓRICO DE MOVIMIENTOS ===
            dbOperations.push(
                tx.historicoMovimientos.create({
                    data: {
                        idUsuario: activeUser.id,
                        idEmpresa: companyId,
                        accion: 'CREAR',
                        tablaOrigen: 'CatPuestos',
                        idRegistro: String(newPositionId),
                        descripcion: `Puesto creado por ${activeUser.first_name} ${activeUser.last_name}`,
                        fechaCreacion: new Date()
                    }
                })
            );

            // Ejecutamos TODAS las inserciones hijas simultáneamente en un único viaje
            await Promise.all(dbOperations);

            return { message: "Puesto creado exitosamente", id: newPositionId };
        }, {
            maxWait: 5000,
            timeout: 25000
        });
    }

    async update(activeUser: ActiveUserDto, companyId: number, positionId: number, data: CreatePositionDto) {
        const user = await this.prisma.auth_user.findFirst({ where: { id: activeUser.id } });
        if (!user) throw new BadRequestException('Tu usuario actual no existe');

        return await this.prisma.$transaction(async (tx) => {
            const { generalInfo, languages } = data;

            const puestoExistente = await tx.catPuestos.findFirst({ where: { idPuesto: positionId, idTenant: activeUser.idTenant, idEmpresa: companyId } });
            if (!puestoExistente) throw new NotFoundException('El puesto solicitado no existe en esta empresa');

            // =========================================================================
            // FASE 1: ACTUALIZACIÓN PADRE Y LIMPIEZA DE RELACIONES ANTERIORES EN PARALELO
            // =========================================================================
            const cleanUpOperations: Promise<any>[] = [
                tx.catPuestos.update({
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
                }),
                tx.idiomasPuesto.deleteMany({ where: { idPuesto: positionId } }),
                tx.horariosPuesto.deleteMany({ where: { idPuesto: positionId } }),
                tx.documentosPuesto.deleteMany({ where: { idPuesto: positionId } }),
                tx.funcionesPuesto.deleteMany({ where: { idPuesto: positionId } }),
                tx.competenciasPuesto.deleteMany({ where: { idPuesto: positionId } }),
                tx.habilidadesPuesto.deleteMany({ where: { idPuesto: positionId } }),
                tx.relPuestoCurso.deleteMany({ where: { idPuesto: positionId } })
            ];

            // Esperamos a que el puesto se actualice y todas las tablas hijas se limpien simultáneamente
            await Promise.all(cleanUpOperations);

            // =========================================================================
            // FASE 2: REINSERCIÓN DE LAS NUEVAS RELACIONES EN PARALELO
            // =========================================================================
            const insertOperations: Promise<any>[] = [];

            // === RELACIÓN: IDIOMAS REQUERIDOS ===
            if (languages?.idiomas && languages.idiomas.length > 0) {
                insertOperations.push(
                    tx.idiomasPuesto.createMany({
                        data: languages.idiomas.map((idIdioma) => ({
                            idPuesto: positionId,
                            idIdioma: Number(idIdioma),
                        })),
                    })
                );
            }

            // === RELACIÓN: HORARIOS DEL PUESTO ===
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
                insertOperations.push(tx.horariosPuesto.createMany({ data: turnosData }));
            }

            // === RELACIÓN: DOCUMENTOS SELECCIONADOS ===
            if (data.documents?.documentosSeleccionados && data.documents.documentosSeleccionados.length > 0) {
                insertOperations.push(
                    tx.documentosPuesto.createMany({
                        data: data.documents.documentosSeleccionados.map((doc) => ({
                            idPuesto: positionId,
                            idDocumento: doc.idDocumento,
                            esObligatorio: doc.Obligatorio === 1,
                        })),
                    })
                );
            }

            // === RELACIÓN: FUNCIONES / ACTIVIDADES CLAVE ===
            if (data.functions?.actividades && data.functions.actividades.length > 0) {
                insertOperations.push(
                    tx.funcionesPuesto.createMany({
                        data: data.functions.actividades.map((actividad) => ({
                            idPuesto: positionId,
                            Funcion: actividad.trim(),
                        })),
                    })
                );
            }

            // === RELACIÓN: COMPETENCIAS CONDUCTUALES ===
            if (data.competencies?.competencias && data.competencies.competencias.length > 0) {
                insertOperations.push(
                    tx.competenciasPuesto.createMany({
                        data: data.competencies.competencias.map((competencia) => ({
                            idPuesto: positionId,
                            Competencia: competencia.trim(),
                        })),
                    })
                );
            }

            // === RELACIÓN: HABILIDADES (DURAS Y BLANDAS UNIFICADAS) ===
            const duras = data.skills?.duras || [];
            const blandas = data.skills?.blandas || [];
            const todasLasHabilidades = [
                ...duras.map(h => ({ name: h.name, level: h.level, tipo: "DURA" })),
                ...blandas.map(h => ({ name: h.name, level: h.level, tipo: "BLANDA" }))
            ];
            if (todasLasHabilidades.length > 0) {
                insertOperations.push(
                    tx.habilidadesPuesto.createMany({
                        data: todasLasHabilidades.map((hab) => ({
                            idPuesto: positionId,
                            Habilidad: hab.name.trim(),
                            Nivel: hab.level,
                            Tipo: hab.tipo,
                        })),
                    })
                );
            }

            // === RELACIÓN: PLANES DE CAPACITACIÓN / CURSOS ===
            if (data.courses?.cursosSeleccionados && data.courses.cursosSeleccionados.length > 0) {
                insertOperations.push(
                    tx.relPuestoCurso.createMany({
                        data: data.courses.cursosSeleccionados.map((curso) => ({
                            idPuesto: positionId,
                            idCurso: curso.idCurso,
                            idTipoCurso: curso.idTipoCourse,
                            activo: true,
                            fechaRegistro: new Date()
                        })),
                    })
                );
            }

            // Registrar el movimiento en el histórico
            insertOperations.push(
                tx.historicoMovimientos.create({
                    data: {
                        idUsuario: activeUser.id,
                        idEmpresa: companyId,
                        accion: 'EDITAR',
                        tablaOrigen: 'CatPuestos',
                        idRegistro: String(positionId),
                        descripcion: `Puesto actualizado por ${activeUser.first_name} ${activeUser.last_name}`,
                        fechaCreacion: new Date()
                    }
                })
            );

            // Ejecutamos todas las inserciones concurrentemente
            await Promise.all(insertOperations);

            return { message: "Puesto actualizado exitosamente" };
        }, {
            maxWait: 5000,
            timeout: 25000
        });
    }

    async changeStatus(activeUser: ActiveUserDto, companyId: number, id: number, active: boolean) {
        const positionExists = await this.prisma.catPuestos.findFirst({
            where: {
                idPuesto: id,
                idTenant: activeUser.idTenant,
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

        // Registrar el movimiento en el histórico
        await this.prisma.historicoMovimientos.create({
            data: {
                idUsuario: activeUser.id,
                idEmpresa: companyId,
                accion: 'VALIDAR',
                tablaOrigen: 'CatPuestos',
                idRegistro: String(id),
                descripcion: `Puesto ${active ? 'activado' : 'desactivado'} por ${activeUser.first_name} ${activeUser.last_name}`,
                fechaCreacion: new Date()
            }
        });

        return { message: active ? 'Puesto activado correctamente' : 'Puesto desactivado correctamente' };
    }

    async generateAIPositionDescription(activeUser: ActiveUserDto, companyId: number, positionId: number) {
        const position = await this.findOne(activeUser, companyId, positionId, 1);

        const activeAiIntegration = await this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatIntegracionesProvedores: {
                    type: 'ai',
                    isActive: true
                }
            },
            include: {
                CatIntegracionesProvedores: true
            }
        });

        if (!activeAiIntegration) {
            throw new BadRequestException('La empresa no tiene ningún proveedor de Inteligencia Artificial conectado. Por favor conecta uno en Configuración > Integraciones');
        }

        const providerId = activeAiIntegration.providerId;
        const aiProvider = await this.integrationFactory.getProvider(providerId);
        const aiGeneratedDescription = await aiProvider.generateJobDescription(companyId, position);

        return { description: aiGeneratedDescription };
    }

    async getCatalogs(activeUser: ActiveUserDto, companyId: number) {
        const areas = await this.prisma.catAreas.findMany({
            where: { Activo: true, idTenant: activeUser.idTenant, idEmpresa: companyId },
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
            where: { Activo: true, aprobada: true, idTenant: activeUser.idTenant, idEmpresa: companyId },
            select: { idPuesto: true, NombrePuesto: true, DescripcionPuesto: true }
        });

        const documents = await this.prisma.catDocumentos.findMany({
            where: { Activo: true, idTenant: activeUser.idTenant, idEmpresa: companyId },
        });

        const courseTypes = await this.prisma.catTipoCurso.findMany({
            where: { activo: true },
        });

        const courses = await this.prisma.catCursos.findMany({
            where: { activo: true, idTenant: activeUser.idTenant, idEmpresa: companyId },
        });

        return { areas, positionTypes, modalities, educationLevels, hiringTypes, salaryLevels, languages, positions, documents, courseTypes, courses };
    }

    async approveOrReject(activeUser: ActiveUserDto, companyId: number, positionId: number, dto: ValidatePositionDto) {
        try {
            const position = await PositionQueries.getPositionInfo(this.prisma, positionId, activeUser.idTenant, companyId);
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

            // Registrar el movimiento en el histórico
            await this.prisma.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: companyId,
                    accion: 'VALIDAR',
                    tablaOrigen: 'CatPuestos',
                    idRegistro: String(positionId),
                    descripcion: `Puesto ${action === 'aprobar' ? 'aprobado' : 'rechazado'} por ${activeUser.first_name} ${activeUser.last_name}`,
                    fechaCreacion: new Date()
                }
            });

            // Notificar al usuario que creo el puesto
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
        const newRequest = await this.prisma.$transaction(async (tx) => {
            // @ts-ignore
            const request = await tx.solicitudPuesto.create({
                data: {
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    idUsuarioSolicita: activeUser.id,
                    descripcion: dto.description,
                    estatusId: 1,
                    fechaCreacion: new Date(),
                    fechaActualizacion: new Date(),
                }
            });

            // @ts-ignore
            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: companyId,
                    accion: 'CREAR',
                    tablaOrigen: 'SolicitudPuesto',
                    idRegistro: String(request.id),
                    descripcion: `Solicitud de puesto creada por ${activeUser.first_name} ${activeUser.last_name}`,
                    fechaCreacion: new Date()
                }
            });

            return request;
        });

        try {
            // Cruzamos RelUsuarioEmpresa (para la empresa activa) y RelUsuarioRol (para el rol de RH = 2)
            const rhUsers = await this.prisma.$queryRaw<Array<{ uuid: string; email: string; phone: string; first_name: string; last_name: string }>>`
                SELECT 
                    au.uuid,
                    au.email,
                    au.phone,
                    au.first_name,
                    au.last_name
                FROM auth_user au
                INNER JOIN RelUsuarioEmpresa rue ON au.id = rue.idUsuario
                INNER JOIN RelUsuarioRol rur ON au.id = rur.idUsuario
                WHERE rue.idEmpresa = ${companyId}
                    AND rue.activo = 1
                    AND rur.idRol = 2
                    AND rur.activo = 1
                    AND au.is_active = 1
                `;

            const maxLength = 80;
            const rawDesc = newRequest.descripcion || '';
            const truncatedDesc = rawDesc.length > maxLength
                ? `${rawDesc.substring(0, maxLength)}...`
                : rawDesc;

            // Si encontramos usuarios de RH para esa empresa, los mapeamos uno a uno para enviar el notify
            if (rhUsers && rhUsers.length > 0) {
                await Promise.all(
                    rhUsers.map(async (rh) => {
                        try {
                            await this.notifications.notify({
                                userUuid: rh.uuid,
                                notificationTypeCode: 'POSITION_REQUEST_CREATED',
                                to: rh.email,
                                phone: rh.phone,
                                subject: 'Nueva solicitud de puesto creada',
                                context: {
                                    name: `${rh.first_name} ${rh.last_name}`,
                                    requestId: newRequest.id,
                                    requestDate: newRequest.fechaCreacion,
                                    shortDescription: truncatedDesc
                                }
                            });
                        } catch (notifyError) {
                            this.logger.error(`Error enviando notificación al usuario de RH con UUID ${rh.uuid}:`, notifyError);
                        }
                    })
                );
            }
        } catch (error) {
            this.logger.error('Error procesando las notificaciones para el equipo de RH:', error);
        }

        return { message: 'Solicitud creada exitosamente' };
    }

    async findAllRequests(
        companyId: number,
        activeUser: ActiveUserDto,
        page: number,
        limit: number,
        filterByUser: boolean,
        estatusId?: number,
        search?: string
    ) {
        const offset = (page - 1) * limit;

        const whereConditions: any = {
            idEmpresa: companyId,
            idTenant: activeUser.idTenant
        };

        if (filterByUser === true) {
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
            // @ts-ignore
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
            // @ts-ignore
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
        // @ts-ignore
        const requestsStatus = await this.prisma.catEstatusSolicitudPuesto.findMany({
            where: { activo: true },
        });
        return requestsStatus;
    }

    async deleteRequest(companyId: number, requestId: number, activeUser: ActiveUserDto) {
        await this.prisma.$transaction(async (tx) => {
            // @ts-ignore
            const request = await tx.solicitudPuesto.findUnique({
                where: { id: requestId, idTenant: activeUser.idTenant, idEmpresa: companyId, idUsuarioSolicita: activeUser.id },
            });
            if (!request) throw new NotFoundException('No se encontró la solicitud');

            // @ts-ignore
            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: companyId,
                    accion: 'ELIMINAR',
                    tablaOrigen: 'SolicitudPuesto',
                    idRegistro: String(requestId),
                    descripcion: `Solicitud de puesto eliminada por ${activeUser.first_name} ${activeUser.last_name}`,
                    fechaCreacion: new Date()
                }
            });

            // @ts-ignore
            await tx.solicitudPuesto.delete({
                where: { id: requestId },
            });
            return { message: 'Solicitud eliminada exitosamente' };
        });
    }

    async approveOrRejectRequests(companyId: number, requestId: number, activeUser: ActiveUserDto, dto: ValidatePositionRequestDto) {
        try {
            // @ts-ignore
            const request = await this.prisma.solicitudPuesto.findUnique({
                where: { id: requestId, idTenant: activeUser.idTenant, idEmpresa: companyId },
            });
            if (!request) throw new NotFoundException('No se encontró la solicitud de creación de puesto');

            const auth_user = await this.prisma.auth_user.findUnique({
                where: { id: request.idUsuarioSolicita },
            });
            if (!auth_user) throw new NotFoundException('No se encontró el usuario solicitante');

            const { id, uuid, username, first_name, last_name, email, phone, } = auth_user;
            const comment = dto.comment || '';
            const action = dto.action;

            const subject = action === 'aprobar'
                ? `✅ Solicitud de puesto #${requestId} aprobada - TalentCore`
                : `❌ Solicitud de puesto #${requestId} rechazada - TalentCore`;

            await this.prisma.$transaction(async (tx) => {
                if (action === 'aprobar') {
                    // @ts-ignore
                    await tx.solicitudPuesto.update({
                        where: { id: requestId, idEmpresa: companyId },
                        data: {
                            estatusId: 3,
                            fechaActualizacion: new Date(),
                            comentarios: comment,
                        }
                    })
                } else {
                    // @ts-ignore
                    await tx.solicitudPuesto.update({
                        where: { id: requestId, idEmpresa: companyId },
                        data: {
                            estatusId: 2,
                            fechaActualizacion: new Date(),
                            comentarios: comment,
                        }
                    })
                }

                // @ts-ignore
                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario: activeUser.id,
                        idEmpresa: companyId,
                        accion: action === 'aprobar' ? 'APROBAR' : 'RECHAZAR',
                        tablaOrigen: 'SolicitudPuesto',
                        idRegistro: String(requestId),
                        descripcion: `Solicitud de puesto ${action === 'aprobar' ? 'aprobada' : 'rechazada'} por ${activeUser.first_name} ${activeUser.last_name}`,
                        fechaCreacion: new Date()
                    }
                });
            });

            const requestDate = new Date(request.fechaCreacion).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "long",
                year: "numeric",
            });

            // Cortamos la descripción a 60 caracteres para el subtítulo del correo
            const shortDescription = request.descripcion.length > 60
                ? `${request.descripcion.substring(0, 60)}...`
                : request.descripcion;

            await this.notifications.notify({
                userUuid: uuid,
                notificationTypeCode: 'POSITION_REQUEST_STATUS_UPDATE',
                to: email,
                phone: phone,
                subject: subject,
                context: {
                    name: `${first_name} ${last_name}`,
                    requestId: request.id,
                    requestDate: requestDate,
                    shortDescription: shortDescription,
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

    // Generar template para carga masiva de puestos y niveles salariales
    async generateBulkTemplate(companyId: number, user: ActiveUserDto): Promise<Buffer> {
        if (!user.idTenant) throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');

        // 1. Consultar catálogos del sistema para la empresa y tenant
        const catalogs = await this.getCatalogs(user, companyId);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Talent Core';
        workbook.created = new Date();

        const styleHeader = (row: ExcelJS.Row, colorHex: string = 'FF1E293B') => {
            row.height = 28;
            row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorHex } };
                cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });
        };

        // ── HOJA 0: CATÁLOGOS (OCULTA) ──
        const sheetCat = workbook.addWorksheet('Catalogos');
        sheetCat.state = 'veryHidden';

        sheetCat.getCell('A1').value = 'Áreas';
        catalogs.areas.forEach((a, i) => (sheetCat.getCell(`A${i + 2}`).value = a.Descripcion?.trim()));

        sheetCat.getCell('B1').value = 'Tipos de Puesto';
        catalogs.positionTypes.forEach((tp, i) => (sheetCat.getCell(`B${i + 2}`).value = (tp as any).NombreTipoPuesto?.trim() || (tp as any).Descripcion?.trim()));

        sheetCat.getCell('C1').value = 'Modalidades';
        catalogs.modalities.forEach((m, i) => (sheetCat.getCell(`C${i + 2}`).value = (m as any).NombreModalidad?.trim() || (m as any).Descripcion?.trim()));

        sheetCat.getCell('D1').value = 'Escolaridades';
        catalogs.educationLevels.forEach((e, i) => (sheetCat.getCell(`D${i + 2}`).value = (e as any).NombreEscolaridad?.trim() || (e as any).Descripcion?.trim()));

        sheetCat.getCell('E1').value = 'Tipos de Contratación';
        catalogs.hiringTypes.forEach((tc, i) => (sheetCat.getCell(`E${i + 2}`).value = (tc as any).NombreTipoContratacion?.trim() || (tc as any).Descripcion?.trim()));

        sheetCat.getCell('F1').value = 'Documentos Disponibles';
        catalogs.documents.forEach((d: any, i) => (sheetCat.getCell(`F${i + 2}`).value = (d.NombreDocumento || d.Descripcion)?.trim()));

        const countAreas = catalogs.areas.length;
        const countTipos = catalogs.positionTypes.length;
        const countMod = catalogs.modalities.length;
        const countEsc = catalogs.educationLevels.length;
        const countCont = catalogs.hiringTypes.length;
        const docsDisponibles = catalogs.documents
            .map((d: any) => (d.NombreDocumento || d.Descripcion)?.trim())
            .filter(Boolean);

        // ── HOJA 1: NIVELES SALARIALES ──
        const sheetSal = workbook.addWorksheet('Niveles Salariales');
        sheetSal.columns = [
            { header: 'Nombre del Nivel *', key: 'nombre', width: 28 },
            { header: 'Salario Mínimo *', key: 'minimo', width: 22, style: { numFmt: '#,##0.00' } },
            { header: 'Salario Máximo *', key: 'maximo', width: 22, style: { numFmt: '#,##0.00' } },
            { header: 'Descripción', key: 'descripcion', width: 35 },
        ];
        styleHeader(sheetSal.getRow(1), 'FF0D9488'); // Teal

        catalogs.salaryLevels.forEach((lvl: any) => {
            sheetSal.addRow({
                nombre: (lvl.NombreNivel || lvl.NombreNivelSalario || lvl.Descripcion || '').toString().trim(),
                minimo: Number(lvl.SueldoMinimo || lvl.SalarioMinimo || 0),
                maximo: Number(lvl.SueldoMaximo || lvl.SalarioMaximo || 0),
                descripcion: lvl.Observaciones || lvl.Descripcion || '',
            });
        });

        if (catalogs.salaryLevels.length === 0) {
            const sample = sheetSal.addRow({
                nombre: 'NIVEL A - DIRECTIVO',
                minimo: 60000.0,
                maximo: 90000.0,
                descripcion: 'Nivel directivo y toma de decisiones estratégicas',
            });
            sample.font = { italic: true, color: { argb: 'FF64748B' } };
        }

        // ── HOJA 2: PUESTOS ──
        const sheetPuestos = workbook.addWorksheet('Puestos');
        sheetPuestos.columns = [
            { header: 'Nombre del Puesto *', key: 'nombre', width: 30 },
            { header: 'Área *', key: 'area', width: 26 },
            { header: 'Tipo de Puesto *', key: 'tipoPuesto', width: 22 },
            { header: 'Modalidad *', key: 'modalidad', width: 20 },
            { header: 'Tipo Contratación', key: 'contratacion', width: 22 },
            { header: 'Nivel Estudios', key: 'estudios', width: 22 },
            { header: 'Nivel Salario', key: 'salario', width: 25 },
            { header: 'Jefe Inmediato', key: 'jefe', width: 28 },
            { header: '¿Disponibilidad Viajar? (SI/NO)', key: 'viajar', width: 25 },
            { header: 'Descripción del Puesto', key: 'descripcion', width: 40 },
            { header: 'Idiomas (Sep. por |)', key: 'idiomas', width: 25 },
            { header: 'Funciones Clave (Sep. por |)', key: 'funciones', width: 40 },
            { header: 'Competencias (Sep. por |)', key: 'competencias', width: 35 },
            { header: 'Habilidades Duras (Hab:Nivel | ...)', key: 'duras', width: 38 },
            { header: 'Habilidades Blandas (Hab:Nivel | ...)', key: 'blandas', width: 38 },
            { header: 'Documentos Obligatorios (Sep. por |)', key: 'documentos', width: 35 },
            { header: 'Horario Turno (DIAS:HH:MM-HH:MM | ...)', key: 'horario', width: 42 },
        ];
        styleHeader(sheetPuestos.getRow(1), 'FF1E40AF'); // Azul oscuro

        // Notas explicativas
        sheetPuestos.getCell('H1').note = {
            texts: [{ text: 'Captura los puestos de mayor a menor jerarquía. Puedes seleccionar cualquier puesto ingresado previamente en la columna A.' }],
        };

        const docsTextGuia = docsDisponibles.length > 0
            ? `Documentos registrados:\n• ${docsDisponibles.join('\n• ')}\n\nSepara múltiples documentos con "|".`
            : 'No hay documentos configurados para esta empresa.';

        sheetPuestos.getCell('P1').note = {
            texts: [{ text: docsTextGuia }],
        };

        sheetPuestos.getCell('Q1').note = {
            texts: [
                {
                    text:
                        'Formato de Horarios:\n' +
                        '• Fijo: LUN,MAR,MIE,JUE,VIE:09:00-18:00\n' +
                        '• Rolado/Variable: LUN,MIE,VIE:08:00-17:00 | MAR,JUE:09:00-18:00 | SAB:09:00-14:00\n\n' +
                        'Usa "|" para separar bloques de turnos en la misma semana.',
                },
            ],
        };

        // Extraer valores reales existentes de la base de datos para los ejemplos
        const areaEjemplo1 = catalogs.areas[0]?.Descripcion?.trim() || '';
        const areaEjemplo2 = catalogs.areas[1]?.Descripcion?.trim() || areaEjemplo1;
        const tipoPuestoEjemplo = (catalogs.positionTypes[0] as any)?.NombreTipoPuesto || (catalogs.positionTypes[0] as any)?.Descripcion || '';
        const modalidadEjemplo = (catalogs.modalities[0] as any)?.NombreModalidad || (catalogs.modalities[0] as any)?.Descripcion || '';
        const contratacionEjemplo = (catalogs.hiringTypes[0] as any)?.NombreTipoContratacion || (catalogs.hiringTypes[0] as any)?.Descripcion || '';
        const escolaridadEjemplo = (catalogs.educationLevels[0] as any)?.NombreEscolaridad || (catalogs.educationLevels[0] as any)?.Descripcion || '';
        const nivelSalarioEjemplo = catalogs.salaryLevels[0]
            ? ((catalogs.salaryLevels[0] as any).NombreNivel || (catalogs.salaryLevels[0] as any).NombreNivelSalario || (catalogs.salaryLevels[0] as any).Descripcion)
            : 'NIVEL A - DIRECTIVO';

        // Ejemplo 1: Puesto jerárquico mayor con Horario FIJO
        const sampleDirector = sheetPuestos.addRow({
            nombre: 'DIRECTOR GENERAL',
            area: areaEjemplo1,
            tipoPuesto: tipoPuestoEjemplo,
            modalidad: modalidadEjemplo,
            contratacion: contratacionEjemplo,
            estudios: escolaridadEjemplo,
            salario: nivelSalarioEjemplo,
            jefe: '',
            viajar: 'SI',
            descripcion: 'Dirección general y toma de decisiones estratégicas de la empresa.',
            idiomas: 'Inglés',
            funciones: 'Planificación estratégica | Supervisión operativa general',
            competencias: 'Liderazgo | Negociación',
            duras: 'Gestión Financiera:Avanzado',
            blandas: 'Comunicación Asertiva:Avanzado',
            documentos: docsDisponibles.slice(0, 2).join(' | '),
            horario: 'LUN,MAR,MIE,JUE,VIE:09:00-18:00',
        });
        sampleDirector.font = { italic: true, color: { argb: 'FF64748B' } };

        // Ejemplo 2: Puesto subordinado con Horarios ROLADOS
        const sampleGerente = sheetPuestos.addRow({
            nombre: 'GERENTE DE OPERACIONES',
            area: areaEjemplo2,
            tipoPuesto: tipoPuestoEjemplo,
            modalidad: modalidadEjemplo,
            contratacion: contratacionEjemplo,
            estudios: escolaridadEjemplo,
            salario: nivelSalarioEjemplo,
            jefe: 'DIRECTOR GENERAL',
            viajar: 'NO',
            descripcion: 'Coordinación y supervisión continua de operaciones.',
            idiomas: 'Inglés',
            funciones: 'Supervisión diaria | Optimización de procesos',
            competencias: 'Trabajo en equipo | Enfoque a resultados',
            duras: 'Metodologías Ágiles:Intermedio',
            blandas: 'Empatía:Avanzado',
            documentos: docsDisponibles.slice(0, 2).join(' | '),
            horario: 'LUN,MIE,VIE:08:00-17:00 | MAR,JUE:09:00-18:00 | SAB:09:00-14:00',
        });
        sampleGerente.font = { italic: true, color: { argb: 'FF64748B' } };

        // ── VALIDACIONES DINÁMICAS EN PUESTOS ──
        for (let r = 2; r <= 300; r++) {
            if (countAreas > 0) {
                sheetPuestos.getCell(`B${r}`).dataValidation = {
                    type: 'list',
                    allowBlank: false,
                    formulae: [`Catalogos!$A$2:$A$${countAreas + 1}`],
                };
            }
            if (countTipos > 0) {
                sheetPuestos.getCell(`C${r}`).dataValidation = {
                    type: 'list',
                    allowBlank: false,
                    formulae: [`Catalogos!$B$2:$B$${countTipos + 1}`],
                };
            }
            if (countMod > 0) {
                sheetPuestos.getCell(`D${r}`).dataValidation = {
                    type: 'list',
                    allowBlank: false,
                    formulae: [`Catalogos!$C$2:$C$${countMod + 1}`],
                };
            }
            if (countCont > 0) {
                sheetPuestos.getCell(`E${r}`).dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: [`Catalogos!$E$2:$E$${countCont + 1}`],
                };
            }
            if (countEsc > 0) {
                sheetPuestos.getCell(`F${r}`).dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: [`Catalogos!$D$2:$D$${countEsc + 1}`],
                };
            }
            sheetPuestos.getCell(`G${r}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: ["'Niveles Salariales'!$A$2:$A$100"],
            };
            sheetPuestos.getCell(`H${r}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: ["'Puestos'!$A$2:$A$300"],
            };
            sheetPuestos.getCell(`I${r}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: ['"SI,NO"'],
            };
        }

        const uint8Array = await workbook.xlsx.writeBuffer();
        return Buffer.from(uint8Array);
    }

    // Procesar carga masiva de puestos y niveles salariales
    async processBulkPositions(companyId: number, file: Express.Multer.File, user: ActiveUserDto) {
        if (!user.idTenant) throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');

        const workbook = new ExcelJS.Workbook();
        try {
            await workbook.xlsx.load(file.buffer as any);
        } catch {
            throw new BadRequestException('El archivo Excel es inválido o está dañado.');
        }

        const sheetSal = workbook.getWorksheet('Niveles Salariales');
        const sheetPuestos = workbook.getWorksheet('Puestos');

        if (!sheetPuestos) {
            throw new BadRequestException('El archivo debe incluir la hoja obligatoria "Puestos".');
        }

        const errors: { row: number; error: string }[] = [];
        let createdSalaries = 0;
        let reusedSalaries = 0;
        let createdPositions = 0;

        // 1. Precargar catálogos completos
        const catalogs = await this.getCatalogs(user, companyId);

        const normalize = (v: any) =>
            String(v || '')
                .trim()
                .toUpperCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');

        const areaMap = new Map<string, number>();
        catalogs.areas.forEach(a => {
            if (a.Descripcion) areaMap.set(normalize(a.Descripcion), a.idArea);
        });

        const tipoPuestoMap = new Map<string, number>();
        catalogs.positionTypes.forEach((tp: any) =>
            tipoPuestoMap.set(normalize(tp.NombreTipoPuesto || tp.Descripcion), tp.idTipoPuesto)
        );

        const modalidadMap = new Map<string, number>();
        catalogs.modalities.forEach((m: any) =>
            modalidadMap.set(normalize(m.NombreModalidad || m.Descripcion), m.idModalidad)
        );

        const contratacionMap = new Map<string, number>();
        catalogs.hiringTypes.forEach((h: any) =>
            contratacionMap.set(normalize(h.NombreTipoContratacion || h.Descripcion), h.idTipoContratacion)
        );

        const escolaridadMap = new Map<string, number>();
        catalogs.educationLevels.forEach((e: any) =>
            escolaridadMap.set(normalize(e.NombreEscolaridad || e.Descripcion), e.idNivelEstudios)
        );

        const salaryMap = new Map<string, number>();
        catalogs.salaryLevels.forEach((s: any) =>
            salaryMap.set(
                normalize(s.NombreNivel || s.NombreNivelSalario || s.Descripcion),
                s.IdNivelSalario || (s as any).idNivelSalario
            )
        );

        const jefeMap = new Map<string, number>();
        catalogs.positions.forEach(p => {
            if (p.NombrePuesto) jefeMap.set(normalize(p.NombrePuesto), p.idPuesto);
        });

        const idiomaMap = new Map<string, number>();
        catalogs.languages.forEach((l: any) =>
            idiomaMap.set(normalize(l.NombreIdioma || l.Descripcion), l.idIdioma)
        );

        // MAPA DE DOCUMENTOS ROBUSTO: tolera cualquier variación de campo en catDocumentos
        const docMap = new Map<string, number>();
        catalogs.documents.forEach((d: any) => {
            const docName = d.NombreDocumento || d.Nombre || d.Descripcion || d.TipoDocumento || d.Titulo;
            const docId = d.idDocumento ?? d.IdDocumento ?? d.id;
            if (docName && docId) {
                docMap.set(normalize(docName), Number(docId));
            }
        });

        // ─────────────────────────────────────────────────────────────
        // PASO 1: PROCESAR HOJA DE NIVELES SALARIALES
        // ─────────────────────────────────────────────────────────────
        if (sheetSal) {
            for (let r = 2; r <= sheetSal.rowCount; r++) {
                const row = sheetSal.getRow(r);
                const nombreSal = row.getCell(1).text?.replace(/["']/g, '').trim();
                const minStr = row.getCell(2).text?.replace(/["',\s]/g, '').trim();
                const maxStr = row.getCell(3).text?.replace(/["',\s]/g, '').trim();
                const descripcion = row.getCell(4).text?.replace(/["']/g, '').trim() || null;

                if (!nombreSal) continue;

                const salKey = normalize(nombreSal);
                if (!salaryMap.has(salKey)) {
                    try {
                        const minNum = minStr && !isNaN(Number(minStr)) ? Number(minStr) : 0;
                        const maxNum = maxStr && !isNaN(Number(maxStr)) ? Number(maxStr) : 0;

                        const nuevoNivel = await this.prisma.catNivelesSalario.create({
                            data: {
                                idTenant: user.idTenant,
                                IdEmpresa: companyId,
                                NombreNivel: nombreSal,
                                Descripcion: descripcion,
                                SalarioMinimo: minNum,
                                SalarioMaximo: maxNum,
                                Activo: true,
                            },
                        });

                        const idSal = (nuevoNivel as any).IdNivelSalario || (nuevoNivel as any).idNivelSalario;
                        salaryMap.set(salKey, idSal);
                        createdSalaries++;
                    } catch (err: any) {
                        errors.push({
                            row: r,
                            error: `[Nivel Salarial ${nombreSal}]: ${err.message || 'Error al registrar el nivel'}`,
                        });
                    }
                } else {
                    reusedSalaries++;
                }
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PASO 2: PROCESAR HOJA DE PUESTOS
        // ─────────────────────────────────────────────────────────────
        for (let r = 2; r <= sheetPuestos.rowCount; r++) {
            const row = sheetPuestos.getRow(r);
            const nombrePuesto = row.getCell(1).text?.replace(/["']/g, '').trim();
            const rawArea = row.getCell(2).text?.replace(/["']/g, '').trim();
            const rawTipo = row.getCell(3).text?.replace(/["']/g, '').trim();
            const rawMod = row.getCell(4).text?.replace(/["']/g, '').trim();

            if (!nombrePuesto && !rawArea) continue; // Fila vacía

            if (!nombrePuesto) {
                errors.push({ row: r, error: 'El nombre del puesto es obligatorio.' });
                continue;
            }

            // Validar catálogos obligatorios
            const idArea = areaMap.get(normalize(rawArea));
            const idTipoPuesto = tipoPuestoMap.get(normalize(rawTipo));
            const idModalidad = modalidadMap.get(normalize(rawMod));

            if (!idArea) {
                errors.push({ row: r, error: `[Puesto ${nombrePuesto}]: El área "${rawArea}" no existe en el sistema para esta empresa.` });
                continue;
            }
            if (!idTipoPuesto) {
                errors.push({ row: r, error: `[Puesto ${nombrePuesto}]: El tipo de puesto "${rawTipo}" no es válido.` });
                continue;
            }
            if (!idModalidad) {
                errors.push({ row: r, error: `[Puesto ${nombrePuesto}]: La modalidad "${rawMod}" no es válida.` });
                continue;
            }

            // Validar catálogos opcionales
            const idTipoContratacion = contratacionMap.get(normalize(row.getCell(5).text)) || null;
            const idNivelEstudios = escolaridadMap.get(normalize(row.getCell(6).text)) || null;
            const idNivelSalario = salaryMap.get(normalize(row.getCell(7).text)) || null;

            // Resolución dinámica de jefe inmediato en cascada
            const rawJefe = row.getCell(8).text?.replace(/["']/g, '').trim();
            let idJefeInmediato: number | null = null;
            if (rawJefe) {
                idJefeInmediato = jefeMap.get(normalize(rawJefe)) || null;
                if (!idJefeInmediato) {
                    errors.push({
                        row: r,
                        error: `[Puesto ${nombrePuesto}]: El jefe inmediato "${rawJefe}" no se encontró (debe capturarse en una fila superior o existir previamente).`,
                    });
                    continue;
                }
            }

            const viajar = normalize(row.getCell(9).text) === 'SI';
            const descripcionPuesto = row.getCell(10).text?.replace(/["']/g, '').trim() || null;

            // Idiomas: "Inglés | Francés"
            const rawIdiomas = row.getCell(11).text?.trim();
            const idiomasIds = rawIdiomas
                ? rawIdiomas.split('|').map(i => idiomaMap.get(normalize(i))).filter(Boolean) as number[]
                : [];

            // Funciones clave
            const rawFunciones = row.getCell(12).text?.trim();
            const actividades = rawFunciones
                ? rawFunciones.split('|').map(f => f.replace(/["']/g, '').trim()).filter(Boolean)
                : [];

            // Competencias conductuales
            const rawComp = row.getCell(13).text?.trim();
            const competencias = rawComp
                ? rawComp.split('|').map(c => c.replace(/["']/g, '').trim()).filter(Boolean)
                : [];

            // Habilidades duras y blandas
            const parseSkills = (cellText: string) => {
                if (!cellText) return [];
                return cellText.split('|').map(item => {
                    const [name, level] = item.split(':').map(s => s.replace(/["']/g, '').trim());
                    return { name: name || '', level: level || 'Intermedio' };
                }).filter(h => h.name.length > 0);
            };

            const duras = parseSkills(row.getCell(14).text);
            const blandas = parseSkills(row.getCell(15).text);

            // Documentos obligatorios: soporta separador '|' o salto de línea
            const rawDocs = row.getCell(16).text?.trim();
            const documentosSeleccionados: { idDocumento: number; Obligatorio: number }[] = [];

            if (rawDocs) {
                const nombresDocs = rawDocs
                    .split(/[|\n]/)
                    .map(d => d.replace(/["']/g, '').trim())
                    .filter(Boolean);

                for (const docNombre of nombresDocs) {
                    const idDoc = docMap.get(normalize(docNombre));
                    if (idDoc) {
                        documentosSeleccionados.push({
                            idDocumento: idDoc,
                            Obligatorio: 1, // Entero 1 estricto para que evalúe a true en create(): doc.Obligatorio === 1
                        });
                    }
                }
            }

            // Horarios: soporta fijos y rolados / variables separados por '|'
            const rawHorario = row.getCell(17).text?.trim();
            const turnos: { days: string[]; start: string; end: string }[] = [];

            if (rawHorario) {
                const bloquesTurnos = rawHorario.split('|').map(b => b.trim()).filter(Boolean);

                for (const bloque of bloquesTurnos) {
                    if (!bloque.includes(':')) continue;

                    const firstColonIndex = bloque.indexOf(':');
                    const diasStr = bloque.substring(0, firstColonIndex).trim();
                    const horasStr = bloque.substring(firstColonIndex + 1).trim();

                    const [start, end] = horasStr.split('-').map(h => h.trim());
                    const daysArray = diasStr.split(',').map(d => d.trim().toUpperCase()).filter(Boolean);

                    if (daysArray.length > 0 && start && end) {
                        turnos.push({
                            days: daysArray,
                            start: start.length === 5 ? start : '09:00',
                            end: end.length === 5 ? end : '18:00',
                        });
                    }
                }
            }

            // DTO estructurado idéntico a CreatePositionDto
            const createDto: any = {
                generalInfo: {
                    nombrePuesto,
                    idArea,
                    idTipoPuesto,
                    idModalidad,
                    idTipoContratacion,
                    idNivelEstudios,
                    idNivelSalario,
                },
                languages: {
                    description: descripcionPuesto,
                    disponibilidadViajar: viajar,
                    idJefeInmediato,
                    idiomas: idiomasIds,
                },
                functions: { actividades },
                competencies: { competencias },
                skills: { duras, blandas },
                documents: { documentosSeleccionados },
                courses: { cursosSeleccionados: [] },
                schedules: { turnos },
            };

            try {
                const result = await this.create(user, companyId, createDto);
                createdPositions++;

                if (result && result.id) {
                    jefeMap.set(normalize(nombrePuesto), result.id);
                }
            } catch (err: any) {
                errors.push({
                    row: r,
                    error: `[Puesto ${nombrePuesto}]: ${err.message || 'Error al crear el puesto'}`,
                });
            }
        }

        const parts: string[] = [`${createdPositions} puestos creados`];
        if (createdSalaries > 0) parts.push(`${createdSalaries} niveles salariales nuevos`);
        else if (reusedSalaries > 0) parts.push(`${reusedSalaries} niveles salariales asociados`);

        return {
            success: true,
            message: `Carga completada: ${parts.join(', ')}.`,
            successCount: createdPositions,
            totalProcessed: createdPositions + errors.length,
            details: { createdPositions, createdSalaries, reusedSalaries },
            errors,
        };
    }

}