import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActiveUserDto, UserFullInfoDto } from '../auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { VacanciesQueries } from './queries/vacancies.queries';
import { CreateRequisitionDto } from './dto/create-requisition.dto';
import { UsersService } from '../users/users.service';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VacanciesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly usersService: UsersService,
        private readonly notifications: NotificationDispatcher,
        private readonly configService: ConfigService,
    ) { }

    async createTestVacancy() {
        const company = await this.prisma.catEmpresas.findFirst();
        if (!company) return { success: false, error: "No company found" };

        const position = await this.prisma.catPuestos.findFirst({ where: { idEmpresa: company.idEmpresa } });
        if (!position) return { success: false, error: "No position found" };

        const site = await this.prisma.catSites.findFirst();
        const user = await this.prisma.auth_user.findFirst();

        const idSite = site?.idSite || 'NULL';
        const idUsuario = user?.id || 'NULL';

        await this.prisma.$executeRawUnsafe(`
            INSERT INTO Vacantes (idEmpresa, idPuesto, idSite, idEstatusVacante, idEstatus, numeroVacantes, SalarioMinimo, SalarioMaximo, Motivo, idUsuarioCreador, InformacionExtra, comentarios, fechaCreacion, fechaActualizacion)
            VALUES (${company.idEmpresa}, ${position.idPuesto}, ${idSite}, 2, 2, 5, 15000, 25000, 'TEST_VACANTE_GLOBAL', ${idUsuario}, 'Esta es una vacante de prueba creada para validar el diseño de la UI del detalle de la vacante sin restricciones de rol.', 'Vacante global visible para todos los roles.', NOW(), NOW())
        `);

        return { success: true, message: "Test vacancy created successfully" };
    }

    async findActiveVacancies(companyId: number, activeUser: ActiveUserDto) {
        let rbacFilter = '';
        const user: UserFullInfoDto = await this.usersService.getUserFullInfo(activeUser.id)
        const roles = user?.roles || [];

        const authUser = await this.prisma.auth_user.findUnique({
            where: { id: activeUser.id },
            select: { uuid: true }
        });

        if (authUser?.uuid) {
            const empleado = await this.prisma.empleados.findFirst({
                where: { idUsuario: authUser.uuid }
            });

            let areaId: number | null | undefined = null;
            if (empleado?.idPuesto) {
                const puesto = await this.prisma.catPuestos.findUnique({ where: { idPuesto: empleado.idPuesto } });
                areaId = puesto?.idArea;
            }

            if (roles.includes('MANAGER') && areaId) {
                rbacFilter = `AND p.idArea = ${areaId}`;
            } else if (roles.includes('RECLUTADOR') && empleado?.idEmpleado) {
                rbacFilter = `AND v.idReclutadorAsignado = ${empleado.idEmpleado}`;
            }
        }

        const query = `
            SELECT v.*, p.NombrePuesto, s.Descripcion as siteName
            FROM Vacantes v
            JOIN CatPuestos p ON v.idPuesto = p.idPuesto
            LEFT JOIN CatSites s ON p.idSite = s.idSite
            WHERE v.idEmpresa = ${companyId} 
              AND v.idEstatusVacante = 2
              AND (
                  (1=1 ${rbacFilter})
                  OR v.Motivo = 'TEST_VACANTE_GLOBAL'
              )
        `;

        const vacancies = await this.prisma.$queryRawUnsafe(query);
        return {
            data: vacancies,
            total: Array.isArray(vacancies) ? vacancies.length : 0
        };
    }

    async findOneVacancy(companyId: number, vacancyId: number) {
        const rows: any[] = await this.prisma.$queryRawUnsafe(`
            SELECT
                v.*,
                p.NombrePuesto,
                p.DescripcionPuesto,
                a.Descripcion AS areaNombre,
                s.Descripcion AS siteName,
                ev.descripcion AS estatusNombre,
                tp.descripcion AS tipoPublicacionNombre,
                CONCAT(u.first_name, ' ', u.last_name) AS creadorNombre,
                CONCAT(ej.nombre, ' ', IFNULL(ej.primerApellido,'')) AS jefeNombre,
                CONCAT(er.nombre, ' ', IFNULL(er.primerApellido,'')) AS reclutadorNombre,
                (SELECT COUNT(*) FROM Entrevistas e WHERE e.idVacante = v.idVacante) AS totalEntrevistas,
                (SELECT COUNT(*) FROM Postulaciones po WHERE po.idVacante = v.idVacante) AS totalPostulantes
            FROM Vacantes v
            JOIN CatPuestos p ON v.idPuesto = p.idPuesto
            LEFT JOIN CatAreas a ON p.idArea = a.idArea
            LEFT JOIN CatSites s ON v.idSite = s.idSite
            LEFT JOIN CatEstatusVacante ev ON v.idEstatusVacante = ev.idEstatusVacante
            LEFT JOIN CatTiposPublicacion tp ON v.idTipoPublicacion = tp.idTipoPublicacion
            LEFT JOIN auth_user u ON v.idUsuarioCreador = u.id
            LEFT JOIN Empleados ej ON v.idJefeInmediato = ej.idEmpleado
            LEFT JOIN Empleados er ON v.idReclutadorAsignado = er.idEmpleado
            WHERE v.idVacante = ${vacancyId} AND v.idEmpresa = ${companyId}
            LIMIT 1
        `);

        if (!rows || rows.length === 0) throw new NotFoundException('Vacante no encontrada');

        const v = rows[0];
        return {
            data: {
                idVacante: typeof v.idVacante === 'bigint' ? Number(v.idVacante) : v.idVacante,
                idPuesto: v.idPuesto,
                nombrePuesto: v.NombrePuesto,
                descripcionPuesto: v.DescripcionPuesto || null,
                area: v.areaNombre || null,
                site: v.siteName || null,
                estatus: v.estatusNombre || null,
                idEstatusVacante: v.idEstatusVacante,
                tipoPublicacion: v.tipoPublicacionNombre || null,
                motivo: v.Motivo || null,
                informacionExtra: v.InformacionExtra || null,
                comentarios: v.comentarios || null,
                numeroVacantes: v.numeroVacantes,
                salarioMinimo: v.SalarioMinimo ? String(v.SalarioMinimo) : null,
                salarioMaximo: v.SalarioMaximo ? String(v.SalarioMaximo) : null,
                creador: v.creadorNombre || null,
                jefeInmediato: v.jefeNombre || null,
                reclutador: v.reclutadorNombre || null,
                fechaCreacion: v.fechaCreacion,
                fechaActualizacion: v.fechaActualizacion,
                totalEntrevistas: typeof v.totalEntrevistas === 'bigint' ? Number(v.totalEntrevistas) : (v.totalEntrevistas || 0),
                totalPostulantes: typeof v.totalPostulantes === 'bigint' ? Number(v.totalPostulantes) : (v.totalPostulantes || 0),
            }
        };
    }

    async findPublicActiveVacancies(companyId: number) {
    // Función para obtener vacantes públicas para la bolsa de trabajo
    async findPublicActiveVacancies(
        companyId: number,
        locationId: number | null,
        areaId: number | null,
        minSalary: number | null,
        maxSalary: number | null,
    ) {
        const vacancies = await VacanciesQueries.getPublicActiveVacancies(
            this.prisma,
            companyId,
            locationId,
            areaId,
            minSalary,
            maxSalary,
        );

        const serialized = vacancies.map((v: any) => ({
            idVacante: typeof v.idVacante === 'bigint' ? Number(v.idVacante) : v.idVacante,
            salarioMinimo: v.SalarioMinimo ? String(v.SalarioMinimo) : null,
            salarioMaximo: v.SalarioMaximo ? String(v.SalarioMaximo) : null,
            fechaCreacion: v.fechaCreacion,
            motivo: v.Motivo || null,
            informacionExtra: v.InformacionExtra || null,
            nombrePuesto: v.NombrePuesto,
            descripcionPuesto: v.DescripcionPuesto || null,
            disponibilidadViajar: v.DisponibilidadViajar ?? false,
            areaName: v.areaName || null,
            modalityName: v.modalityName || null,
            siteName: v.siteName || null,
            contractTypeName: v.contractTypeName || null,
            tipoPublicacionName: v.tipoPublicacionName || null,
            empresaName: v.empresaName || null,
        }));

        return {
            data: serialized,
            total: serialized.length,
        };
    }

    // Obtener vacante activa pública por ID para la bolsa de trabajo
    async findPublicActiveVacancyById(companyId: number, vacancyId: number) {
        const vacancy = await VacanciesQueries.getPublicActiveVacancyById(
            this.prisma,
            companyId,
            vacancyId,
        );

        if (!vacancy) {
            throw new NotFoundException(`La vacante con ID ${vacancyId} no fue encontrada o no está disponible.`);
        }

        const serialized = {
            idVacante: typeof vacancy.idVacante === 'bigint' ? Number(vacancy.idVacante) : vacancy.idVacante,
            salarioMinimo: vacancy.SalarioMinimo ? String(vacancy.SalarioMinimo) : null,
            salarioMaximo: vacancy.SalarioMaximo ? String(vacancy.SalarioMaximo) : null,
            fechaCreacion: vacancy.fechaCreacion,
            motivo: vacancy.Motivo || null,
            informacionExtra: vacancy.InformacionExtra || null,
            nombrePuesto: vacancy.NombrePuesto,
            descripcionPuesto: vacancy.DescripcionPuesto || null,
            disponibilidadViajar: vacancy.DisponibilidadViajar ?? false,
            areaName: vacancy.areaName || null,
            modalityName: vacancy.modalityName || null,
            siteName: vacancy.siteName || null,
            contractTypeName: vacancy.contractTypeName || null,
            tipoPublicacionName: vacancy.tipoPublicacionName || null,
            empresaName: vacancy.empresaName || null,
        };

        return { data: serialized };
    }

    async findAllRequisitions(companyId: number, page: number, search: string, limit: number, activeUser: ActiveUserDto) {
        const userRole = await this.prisma.relUsuarioRol.findFirst({
            where: {
                idUsuario: activeUser.id,
                activo: true
            }
        });

        if (!userRole) throw new NotFoundException('El usuario no cuenta con un rol asignado en el sistema.');

        const skip = (page - 1) * limit;

        const [requisitions, total] = await Promise.all([
            VacanciesQueries.getPaginatedRequisitions(
                this.prisma,
                companyId,
                activeUser.id,
                userRole.idRol,
                skip,
                limit,
                search
            ),
            VacanciesQueries.countRequisitions(
                this.prisma,
                companyId,
                activeUser.id,
                userRole.idRol,
                search
            )
        ]);

        return {
            data: requisitions,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit)
        };
    }

    async findRequisitionById(companyId: number, requisitionId: number, activeUser: ActiveUserDto) {
        // Obtener la requisición / vacante
        const requisition = await this.prisma.vacantes.findUnique({
            where: {
                idVacante: requisitionId,
                idEmpresa: companyId
            }
        });

        if (!requisition) throw new NotFoundException('La requisición no existe o no pertenece a tu empresa');

        // Obtener el rol del usuario conectado en la plataforma
        const userRole = await this.prisma.relUsuarioRol.findFirst({
            where: {
                idUsuario: activeUser.id,
                activo: true
            }
        });

        if (!userRole) throw new NotFoundException('Rol de usuario no encontrado o inactivo');

        let canApproveOrReject = false;
        let userContextRole = 'VIEWER'; // 'JEFE_INMEDIATO', 'RECURSOS_HUMANOS', 'CREADOR', 'VIEWER'

        const status = requisition.idEstatusVacante;

        // --- ESCENARIO 1: Pendiente de Manager (Estatus 1) ---
        if (status === 1) {
            // Obtenemos el creador de la vacante a través de auth_user para jalar su uuid
            const creadorUser = await this.prisma.auth_user.findUnique({
                where: { id: requisition.idUsuarioCreador }
            });

            if (creadorUser) {
                // Buscamos mediante queryRaw quién es el jefe inmediato real de la persona que CREÓ la vacante
                const bossResult = await this.prisma.$queryRaw<any[]>`
                SELECT u.uuid
                FROM Empleados creador
                JOIN Empleados jefe ON creador.idJefeInmediato = jefe.idEmpleado
                JOIN auth_user u ON jefe.idUsuario = u.uuid
                WHERE creador.idUsuario = ${creadorUser.uuid}
                    AND creador.idEmpresa = ${companyId}
                    AND jefe.activo = 1
                    AND u.is_active = 1
            `;

                // Si el usuario logueado (activeUser.uuid) coincide con el jefe del creador
                if (bossResult && bossResult.length > 0 && bossResult[0].uuid === activeUser.uuid) {
                    canApproveOrReject = true;
                    userContextRole = 'JEFE_INMEDIATO';
                }
                // Si no es su jefe, pero es el usuario que levantó físicamente la requisición
                else if (requisition.idUsuarioCreador === activeUser.id) {
                    userContextRole = 'CREADOR';
                }
            }
        }

        // --- ESCENARIO 2: Aprobado Manager (Estatus 2) ---
        else if (status === 2) {
            // Validar el rol corporativo de Recursos Humanos
            const ID_ROL_RECURSOS_HUMANOS = 2;

            if (userRole.idRol === ID_ROL_RECURSOS_HUMANOS) {
                canApproveOrReject = true;
                userContextRole = 'RECURSOS_HUMANOS';
            }
        }

        return {
            requisition,
            permissions: {
                canApproveOrReject,
                userContextRole
            }
        };
    }

    async findAllowedPositions(companyId: number, activeUser: ActiveUserDto) {
        const userAuth = await this.prisma.auth_user.findUnique({
            where: {
                id: activeUser.id
            },
            include: {
                Empleados: {
                    where: {
                        idEmpresa: companyId,
                        activo: true
                    }
                }
            }
        });

        if (!userAuth) throw new NotFoundException('Usuario de autenticación no encontrado.');

        const empleado = userAuth.Empleados?.[0];
        if (!empleado || !empleado.idPuesto) {
            throw new ForbiddenException('El usuario actual no tiene un perfil de empleado activo asignado.');
        }

        const idPuestoDelJefe = empleado.idPuesto;

        // Traemos TODOS los puestos activos de la empresa para procesar la jerarquía en memoria
        const allPositions = await this.prisma.catPuestos.findMany({
            where: {
                idEmpresa: companyId,
                Activo: true,
                aprobada: true,
                pendiente: false
            },
            select: {
                idPuesto: true,
                NombrePuesto: true,
                DescripcionPuesto: true,
                idJefeInmediato: true
            }
        });

        // Función recursiva interna para recolectar todos los puestos descendientes
        const allowedPositions: typeof allPositions = [];

        const getDescendants = (parentId: number) => {
            const children = allPositions.filter(pos => pos.idJefeInmediato === parentId);

            for (const child of children) {
                allowedPositions.push(child);
                getDescendants(child.idPuesto);
            }
        };

        // Ejecutamos la recursión partiendo desde el puesto del usuario logueado
        getDescendants(idPuestoDelJefe);
        allowedPositions.sort((a, b) => a.NombrePuesto.localeCompare(b.NombrePuesto));

        return allowedPositions;
    }

    async findAllowedLocations(companyId: number, activeUser: ActiveUserDto) {
        const userSites = await this.prisma.relUsuarioSite.findMany({
            where: {
                idUsuario: activeUser.id,
                activo: true,
                // @ts-ignore
                CatSites: {
                    idEmpresa: companyId,
                    Activo: true
                }
            },
            select: {
                // @ts-ignore
                CatSites: {
                    select: {
                        idSite: true,
                        Descripcion: true,
                        EsPrincipal: true
                    }
                }
            },
            orderBy: {
                // @ts-ignore
                CatSites: {
                    Descripcion: 'asc'
                }
            }
        });

        return userSites
            // @ts-ignore
            .filter(us => us.CatSites !== null)
            .map(us => ({
                // @ts-ignore
                idSite: us.CatSites!.idSite,
                // @ts-ignore
                Descripcion: us.CatSites!.Descripcion,
                // @ts-ignore
                EsPrincipal: us.CatSites!.EsPrincipal
            }));
    }

    async findRequisitionCatalogs(companyId: number, positionId: number, activeUser: ActiveUserDto) {
        // Obtener los tipos de publicación activos
        const publicationTypes = await this.prisma.catTiposPublicacion.findMany({
            where: { activo: true }
        });

        // Obtener el puesto seleccionado para extraer su puesto jefe estructural (idJefeInmediato)
        const selectedPosition = await this.prisma.catPuestos.findUnique({
            where: { idPuesto: positionId },
            select: { idJefeInmediato: true }
        });

        // Si el puesto no existe o no tiene un puesto superior configurado (es la cabeza del organigrama)
        if (!selectedPosition || !selectedPosition.idJefeInmediato) {
            return {
                publicationTypes,
                immediateBosses: []
            };
        }

        // Obtener los empleados activos que ocupan físicamente el puesto superior dentro de la empresa
        const employees = await this.prisma.empleados.findMany({
            where: {
                idEmpresa: companyId,
                idPuesto: selectedPosition.idJefeInmediato,
                activo: true
            },
            select: {
                idEmpleado: true,
                nombre: true,
                primerApellido: true,
                segundoApellido: true,
                // @ts-ignore
                CatPuestos: {
                    select: {
                        NombrePuesto: true
                    }
                }
            }
        });

        // Mapeamos los empleados formateando el nombre completo JUNTO con su puesto entre paréntesis
        const immediateBosses = employees.map(emp => {
            const fullName = `${emp.nombre || ""} ${emp.primerApellido || ""} ${emp.segundoApellido || ""}`.trim().toUpperCase();
            // @ts-ignore
            const positionName = emp.CatPuestos?.NombrePuesto ? ` (${emp.CatPuestos.NombrePuesto.toUpperCase()})` : "";

            return {
                value: String(emp.idEmpleado),
                label: `${fullName}${positionName}`
            };
        });

        return { publicationTypes, immediateBosses };
    }

    async createRequisition(companyId: number, requisitionDto: CreateRequisitionDto, activeUser: ActiveUserDto) {
        // Obtener el puesto e incluir su nivel salarial asignado de una sola vez
        const position = await this.prisma.catPuestos.findUnique({
            where: {
                idPuesto: requisitionDto.idPuesto,
                idEmpresa: companyId,
                Activo: true,
                aprobada: true,
                pendiente: false
            },
            include: { CatNivelesSalario: true }
        });

        if (!position) {
            throw new NotFoundException('El puesto seleccionado no existe, o no ha sido aprobado. Por favor, seleccione un puesto válido.');
        }

        // Validar que el salario ingresado se encuentre dentro de los rangos del nivel salarial asignado al puesto
        if (position.CatNivelesSalario) {
            const { SalarioMinimo: nivelMin, SalarioMaximo: nivelMax, NombreNivel } = position.CatNivelesSalario;

            // Validar que el salario mínimo ingresado no sea menor al permitido por el nivel
            if (nivelMin !== null && requisitionDto.salarioMinimo < Number(nivelMin)) {
                throw new BadRequestException(
                    `El salario mínimo ingresado $${requisitionDto.salarioMinimo} es menor al permitido para el nivel salarial del puesto "${NombreNivel}" $${nivelMin}.`
                );
            }

            // Validar que el salario máximo ingresado no supere el permitido por el nivel
            if (nivelMax !== null && requisitionDto.salarioMaximo > Number(nivelMax)) {
                throw new BadRequestException(
                    `El salario máximo ingresado $${requisitionDto.salarioMaximo} supera el límite permitido para el nivel salarial del puesto "${NombreNivel}" $${nivelMax}.`
                );
            }
        }

        // Validar consistencia lógica básica del rango ingresado en el DTO
        if (requisitionDto.salarioMinimo > requisitionDto.salarioMaximo) {
            throw new BadRequestException('El salario mínimo no puede ser mayor que el salario máximo.');
        }

        // Obtener plazas autorizadas y empleados ocupando el puesto en esa ubicación específica en paralelo
        const [allocation, occupiedPlazasCount] = await Promise.all([
            this.prisma.relPuestosUbicaciones.findUnique({
                where: {
                    idPuesto_idSite: {
                        idPuesto: requisitionDto.idPuesto,
                        idSite: requisitionDto.idSite
                    }
                },
                select: {
                    PlazasAutorizadas: true
                }
            }),
            this.prisma.empleados.count({
                where: {
                    idEmpresa: companyId,
                    idPuesto: requisitionDto.idPuesto,
                    idSite: requisitionDto.idSite,
                    activo: true
                }
            })
        ]);

        const authorizedPlazas = allocation?.PlazasAutorizadas ?? 0;
        const availablePlazas = authorizedPlazas - occupiedPlazasCount;

        // Validar si el número de vacantes solicitado cabe en las plazas libres
        if (requisitionDto.numeroVacantes > availablePlazas) {
            throw new BadRequestException(
                `Cupo de plazas insuficiente. Plazas autorizadas en esta sede: ${authorizedPlazas}, ocupadas actualmente: ${occupiedPlazasCount}. Disponibles: ${availablePlazas}. Solicitaste: ${requisitionDto.numeroVacantes}.`
            );
        }

        const newRequisition = await this.prisma.vacantes.create({
            data: {
                idUsuarioCreador: activeUser.id,
                idEmpresa: companyId,
                idPuesto: requisitionDto.idPuesto,
                idSite: requisitionDto.idSite,
                idJefeInmediato: requisitionDto.idJefeInmediato ?? 0,
                Motivo: requisitionDto.motivo,
                // @ts-ignore
                numeroVacantes: requisitionDto.numeroVacantes,
                SalarioMinimo: requisitionDto.salarioMinimo,
                SalarioMaximo: requisitionDto.salarioMaximo,
                InformacionExtra: requisitionDto.informacionExtra,
                idEstatusVacante: 1,
                idTipoPublicacion: requisitionDto.idTipoPublicacion,
            }

            return { requisition, jefeSolicitante };
        });

        if (txResult.jefeSolicitante) {
            const { uuid, email, phone, first_name, last_name } = txResult.jefeSolicitante;

            await this.notifications.notify({
                userUuid: uuid,
                notificationTypeCode: 'REQUISITION_CREATED',
                to: email,
                phone: phone,
                subject: "Nueva requisición de vacante creada",
                context: {
                    name: `${first_name} ${last_name}`,
                    requestingUser: `${activeUser.first_name} ${activeUser.last_name}`,
                    numberOfVacancies: txResult.requisition.numeroVacantes,
                    position: position.NombrePuesto,
                    date: txResult.requisition.fechaCreacion
                }
            });
        }

        return { message: 'Requisición validada y creada exitosamente.' };
    }

    async deleteRequisition(companyId: number, requisitionId: number, activeUser: ActiveUserDto) {
        await this.prisma.$transaction(async (tx) => {
            const requisition = await tx.vacantes.findUnique({
                where: { idVacante: requisitionId },
            });
            if (!requisition) throw new NotFoundException('No se encontró la requisición');

            // @ts-ignore
            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: companyId,
                    accion: 'ELIMINAR',
                    tablaOrigen: 'Vacantes',
                    idRegistro: requisitionId,
                    descripcion: `Requisición eliminada por ${activeUser.first_name} ${activeUser.last_name}`,
                    fechaCreacion: new Date()
                }
            });

            await tx.vacantes.delete({
                where: { idVacante: requisitionId },
            });
            return { message: 'Requisición eliminada exitosamente' };
        });
    }

    async evaluateRequisition(companyId: number, requisitionId: number, action: 'aprobar' | 'rechazar', activeUser: ActiveUserDto) {

        const { requisition, permissions } = await this.findRequisitionById(companyId, requisitionId, activeUser);

        if (!permissions.canApproveOrReject) {
            throw new ForbiddenException('No tienes privilegios para dictaminar esta requisición en su estatus actual.');
        }

        const currentStatus = requisition.idEstatusVacante;

        // Manejo de Rechazo Común
        if (action === 'rechazar') {
            if (permissions.userContextRole == 'JEFE_INMEDIATO') {
                await this.prisma.vacantes.update({
                    where: { idVacante: requisitionId },
                    data: { idEstatusVacante: 3 }
                });
            } else if (currentStatus === 2 && permissions.userContextRole === 'RECURSOS_HUMANOS') {
                await this.prisma.vacantes.update({
                    where: { idVacante: requisitionId },
                    data: { idEstatusVacante: 6 }
                });
            }
            await this.prisma.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: companyId,
                    accion: 'RECHAZAR',
                    tablaOrigen: 'Vacantes',
                    idRegistro: requisitionId,
                    descripcion: `Requisición rechazada por ${activeUser.first_name} ${activeUser.last_name}`,
                    fechaCreacion: new Date()
                }
            });
            return { message: 'Requisición rechazada exitosamente.' };
        }

        // --- MANEJO DE APROBACIONES SECUENCIALES ---
        // A. Obtener datos del Creador Original de la Requisición
        const creadorUser = await this.prisma.auth_user.findUnique({
            where: { id: requisition.idUsuarioCreador },
            select: { uuid: true, email: true, phone: true, first_name: true, last_name: true }
        });

        // Aprobación del jefe inmediato
        if (currentStatus === 1 && permissions.userContextRole === 'JEFE_INMEDIATO') {
            await this.prisma.vacantes.update({
                where: { idVacante: requisitionId },
                data: { idEstatusVacante: 2 }
            });

            await this.prisma.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: companyId,
                    accion: 'APROBAR',
                    tablaOrigen: 'Vacantes',
                    idRegistro: requisitionId,
                    descripcion: `Requisición aprobada por el Manager: ${activeUser.first_name} ${activeUser.last_name}`,
                    fechaCreacion: new Date()
                }
            });

            // BLOQUE DE NOTIFICACIONES TRAS APROBACIÓN DEL MANAGER
            try {

                // B. Consultar el pool completo de usuarios asignados al área de RH (idRol = 2)
                const rhUsers = await this.prisma.$queryRaw<Array<{ uuid: string; email: string; phone: string; first_name: string; last_name: string }>>`
                SELECT au.uuid, au.email, au.phone, au.first_name, au.last_name
                FROM auth_user au
                INNER JOIN RelUsuarioEmpresa rue ON au.id = rue.idUsuario
                INNER JOIN RelUsuarioRol rur ON au.id = rur.idUsuario
                WHERE rue.idEmpresa = ${companyId}
                    AND rue.activo = 1
                    AND rur.idRol = 2
                    AND rur.activo = 1
                    AND au.is_active = 1
            `;

                // Ejecución paralela de envío de notificaciones para evitar cuellos de botella
                const notificationPromises: Promise<any>[] = [];

                // Notificación al Creador Original
                if (creadorUser) {
                    notificationPromises.push(
                        this.notifications.notify({
                            userUuid: creadorUser.uuid,
                            notificationTypeCode: 'REQUISITION_APPROVED_BY_MANAGER',
                            to: creadorUser.email,
                            phone: creadorUser.phone,
                            subject: 'Tu requisición fue autorizada por tu Manager',
                            context: {
                                requestId: requisition.idVacante,
                                action: 'aprobar',
                                requestDate: requisition.fechaCreacion?.toLocaleDateString() || ''
                            }
                        }).catch(err => console.error(`Error notificando al creador original: ${err.message}`))
                    );
                }

                // Notificaciones masivas al equipo de Recursos Humanos
                if (rhUsers && rhUsers.length > 0) {
                    rhUsers.forEach((rh) => {
                        notificationPromises.push(
                            this.notifications.notify({
                                userUuid: rh.uuid,
                                notificationTypeCode: 'REQUISITION_APPROVED_BY_MANAGER_TO_RH',
                                to: rh.email,
                                phone: rh.phone,
                                subject: 'Nueva requisición pendiente de publicación',
                                context: {
                                    name: `${rh.first_name} ${rh.last_name}`,
                                    requestId: requisition.idVacante,
                                    requestDate: requisition.fechaCreacion?.toLocaleDateString() || '',
                                    shortDescription: `Puesto pendiente de validación final por RH.`
                                }
                            }).catch(err => console.error(`Error notificando a RH (${rh.uuid}): ${err.message}`))
                        );
                    });
                }

                await Promise.all(notificationPromises);

            } catch (notifError) {
                console.error('Error procesando las alertas asíncronas de dictamen:', notifError);
            }

            return { message: 'Requisición aprobada por el Manager. Enviada a Recursos Humanos.' };
        }

        // Aprobación de Recursos Humanos
        else if (currentStatus === 2 && permissions.userContextRole === 'RECURSOS_HUMANOS') {
            const baseUrl = this.configService.get<string>('FRONT_URL');
            const publicUiUrl = `${baseUrl}job-board/${requisitionId}`;

            const links = {
                slugLinkedin: `${publicUiUrl}?utm_source=linkedin`,
                slugFacebook: `${publicUiUrl}?utm_source=facebook`,
                slugInstagram: `${publicUiUrl}?utm_source=instagram`
            }

            const position = await this.prisma.$transaction(async (tx) => {
                const [_, __, catPuestoResult] = await Promise.all([
                    // Cierre definitivo del flujo: Pasa a Publicada
                    tx.vacantes.update({
                        where: { idVacante: requisitionId },
                        data: { idEstatusVacante: 5, links }
                    }),
                    tx.historicoMovimientos.create({
                        data: {
                            idUsuario: activeUser.id,
                            idEmpresa: companyId,
                            accion: 'APROBAR',
                            tablaOrigen: 'Vacantes',
                            idRegistro: requisitionId,
                            descripcion: `Requisición aprobada y publicada por Recursos Humanos: ${activeUser.first_name} ${activeUser.last_name}`,
                            fechaCreacion: new Date()
                        }
                    }),
                    tx.catPuestos.findUnique({
                        where: { idPuesto: requisition.idPuesto }
                    })
                ]);

                return catPuestoResult;
            });

            // Notificación al Creador Original
            if (creadorUser) {
                this.notifications.notify({
                    userUuid: creadorUser.uuid,
                    notificationTypeCode: 'REQUISITION_APPROVED_BY_RH',
                    to: creadorUser.email,
                    phone: creadorUser.phone,
                    subject: 'Tu requisición fue autorizada y publicada por Recursos Humanos',
                    context: {
                        positionName: position?.NombrePuesto,
                        requestDate: requisition.fechaCreacion?.toLocaleDateString() || ''
                    }
                }).catch(err => console.error(`Error notificando al creador original: ${err.message}`))
            }

            return {
                message: 'Requisición aprobada y publicada con éxito.',
                urls: links
            };
        }
    }

    async updateRequisition() {

    }

    async changeStatus() {

    }
}
