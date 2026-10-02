import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';

const DIAS_CLAVE = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

@Injectable()
export class WorkShiftsService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(
        user: ActiveUserDto,
        companyId: number,
        page: number,
        limit: number,
        startDateStr?: string,
        search?: string,
        idSite?: string,
        idUnidadOperativa?: string,
    ) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const offset = (page - 1) * limit;

        // 1. Calcular rango de fechas de la semana (Lunes a Domingo)
        const { lunes, domingo, diasSemanaFechas } = this.getWeekRange(startDateStr);
        const anioConsulta = lunes.getFullYear();

        // 2. Consulta directa en Prisma para obtener el umbral legal del año
        let horasSemanalesLimite = 48.0;
        let isReformaActiva = false;

        const configLegal = await this.prisma.configuracionJornadaLegal.findFirst({
            where: {
                idEmpresa: companyId,
                idTenant: user.idTenant,
                anio: anioConsulta,
                activo: true,
            },
            select: {
                horasSemana: true,
            },
        });

        if (configLegal && configLegal.horasSemana) {
            horasSemanalesLimite = Number(configLegal.horasSemana);
            isReformaActiva = true;
        }

        const limiteMinutosLegal = Math.round(horasSemanalesLimite * 60);

        // 3. Filtro de búsqueda por nombre o número de empleado
        const searchFilter = search?.trim()
            ? Prisma.sql`AND (
                ep.numeroEmpleado LIKE ${`%${search.trim()}%`} OR
                ep.nombre LIKE ${`%${search.trim()}%`} OR
                ep.primerApellido LIKE ${`%${search.trim()}%`} OR
                ep.segundoApellido LIKE ${`%${search.trim()}%`}
            )`
            : Prisma.empty;

        // 3.1 Filtro por ubicación / unidad operativa (idSite gana si vienen ambos)
        let siteFilterSql = Prisma.empty;

        if (idSite && !isNaN(Number(idSite))) {
            siteFilterSql = Prisma.sql`AND ep.idSite = ${Number(idSite)}`;
        } else if (idUnidadOperativa && !isNaN(Number(idUnidadOperativa))) {
            const sites = await this.prisma.catSites.findMany({
                where: {
                    idUnidadOperativa: Number(idUnidadOperativa),
                    idTenant: user.idTenant,
                },
                select: { idSite: true },
            });
            const siteIds = sites.map((s) => Number(s.idSite));

            // Unidad sin ubicaciones => no debe regresar empleados
            siteFilterSql = siteIds.length > 0
                ? Prisma.sql`AND ep.idSite IN (${Prisma.join(siteIds)})`
                : Prisma.sql`AND 1 = 0`;
        }


        // 4. Conteo de empleados con expediente completo (idEstatus = 4)
        const countResult = await this.prisma.$queryRaw<{ total: bigint }[]>`
            SELECT COUNT(DISTINCT ep.idEmpleado) as total
            FROM Empleados ep
            JOIN Expedientes exp ON exp.idEmpleado = ep.idEmpleado AND exp.idTenant = ep.idTenant
            WHERE ep.idEmpresa = ${companyId}
                AND ep.idTenant = ${user.idTenant}
                AND ep.activo = 1
                -- AND exp.idEstatus = 4
                ${searchFilter}
                ${siteFilterSql}
        `;
        const total = countResult[0]?.total ? Number(countResult[0].total) : 0;

        if (total === 0) {
            return {
                data: [],
                total: 0,
                currentPage: page,
                totalPages: 1,
                semana: {
                    inicio: lunes.toISOString().split('T')[0],
                    fin: domingo.toISOString().split('T')[0],
                    anio: anioConsulta,
                    horasLimiteLegal: horasSemanalesLimite,
                    reformaActiva: isReformaActiva,
                    dias: diasSemanaFechas.map(d => ({ fecha: d.fechaStr, dia: d.diaNombre })),
                },
            };
        }

        // 5. Empleados paginados
        const empleados = await this.prisma.$queryRaw<any[]>`
            SELECT 
                ep.idEmpleado,
                ep.numeroEmpleado,
                TRIM(CONCAT(ep.nombre, ' ', ep.primerApellido, ' ', COALESCE(ep.segundoApellido, ''))) AS nombreCompleto,
                p.NombrePuesto AS puesto,
                COALESCE(cm.Descripcion, 'Turno Estándar') AS turno
            FROM Empleados ep
            JOIN Expedientes exp ON exp.idEmpleado = ep.idEmpleado AND exp.idTenant = ep.idTenant
            LEFT JOIN CatPuestos p ON p.idPuesto = ep.idPuesto
            LEFT JOIN CatModalidad cm ON cm.idModalidad = ep.idModalidad
            WHERE ep.idEmpresa = ${companyId}
                AND ep.idTenant = ${user.idTenant}
                AND ep.activo = 1
                -- AND exp.idEstatus = 4
                ${searchFilter}
            ORDER BY ep.primerApellido ASC, ep.nombre ASC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const employeeIds = empleados.map(e => Number(e.idEmpleado));

        // 6. Jornadas registradas en la semana
        const fechaInicioStr = lunes.toISOString().split('T')[0];
        const fechaFinStr = domingo.toISOString().split('T')[0];

        const jornadas = await this.prisma.$queryRaw<any[]>`
            SELECT 
                j.idJornada,
                j.idEmpleado,
                DATE_FORMAT(j.fecha, '%Y-%m-%d') as fecha,
                j.horaEntradaReal,
                j.horaSalidaReal,
                j.minutosTrabajados,
                j.minutosRetardo,
                j.estatusJornada
            FROM JornadasEmpleado j
            WHERE j.idEmpleado IN (${Prisma.join(employeeIds)})
                AND j.fecha >= ${fechaInicioStr}
                AND j.fecha <= ${fechaFinStr}
        `;

        // 7. Horarios semanales de los empleados (Llamada directa nativa en Prisma)
        const horariosProgramados = await this.prisma.horariosEmpleado.findMany({
            where: {
                idEmpleado: { in: employeeIds },
            },
            select: {
                idEmpleado: true,
                DiaSemana: true,
            },
        });

        // 8. Mapear matriz semanal con cálculo dinámico contra el límite del año
        const data = empleados.map((emp) => {
            const empId = Number(emp.idEmpleado);
            const empJornadas = jornadas.filter(j => Number(j.idEmpleado) === empId);
            const empHorarios = horariosProgramados.filter(h => Number(h.idEmpleado) === empId);

            let totalMinutosSemana = 0;

            const semanaDias = diasSemanaFechas.map(({ fechaStr, diaNombre }) => {
                const jornadaDia = empJornadas.find(j => j.fecha === fechaStr);
                const tieneHorarioConfigurado = empHorarios.some(h => h.DiaSemana === diaNombre);

                if (jornadaDia) {
                    const minutos = Number(jornadaDia.minutosTrabajados) || 0;
                    totalMinutosSemana += minutos;

                    let displayTexto = this.formatMinutosAHora(minutos);
                    let variant: 'cerrada' | 'cierre_automatico' | 'incompleta' | 'falta' | 'descanso' = 'cerrada';

                    if (jornadaDia.estatusJornada === 'CIERRE_AUTOMATICO') {
                        displayTexto = `${displayTexto} auto`;
                        variant = 'cierre_automatico';
                    } else if (jornadaDia.estatusJornada === 'ABIERTA' || jornadaDia.estatusJornada === 'INCOMPLETA') {
                        displayTexto = 'Sin salida';
                        variant = 'incompleta';
                    } else if (jornadaDia.estatusJornada === 'FALTA') {
                        displayTexto = 'Falta';
                        variant = 'falta';
                    }

                    return {
                        fecha: fechaStr,
                        dia: diaNombre,
                        texto: displayTexto,
                        minutos,
                        estatus: jornadaDia.estatusJornada,
                        variant,
                    };
                }

                if (!tieneHorarioConfigurado) {
                    return {
                        fecha: fechaStr,
                        dia: diaNombre,
                        texto: 'Descanso',
                        minutos: 0,
                        estatus: 'DESCANSO',
                        variant: 'descanso' as const,
                    };
                }

                const fechaDiaObj = new Date(`${fechaStr}T23:59:59`);
                const yaPaso = fechaDiaObj < new Date();

                return {
                    fecha: fechaStr,
                    dia: diaNombre,
                    texto: yaPaso ? 'Falta' : '-',
                    minutos: 0,
                    estatus: yaPaso ? 'FALTA' : 'PENDIENTE',
                    variant: (yaPaso ? 'falta' : 'descanso') as any,
                };
            });

            // Cumplimiento calculado sobre el límite del año vigente
            const porcentajeCumplimiento = Number(((totalMinutosSemana / limiteMinutosLegal) * 100).toFixed(1));

            return {
                idEmpleado: empId,
                numeroEmpleado: emp.numeroEmpleado,
                nombreCompleto: emp.nombreCompleto,
                puesto: emp.puesto,
                turno: emp.turno,
                dias: semanaDias,
                totalHorasSemana: this.formatMinutosAHora(totalMinutosSemana),
                totalMinutosSemana,
                porcentajeCumplimiento,
            };
        });

        return {
            data,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
            semana: {
                inicio: lunes.toISOString().split('T')[0],
                fin: domingo.toISOString().split('T')[0],
                anio: anioConsulta,
                horasLimiteLegal: horasSemanalesLimite,
                reformaActiva: isReformaActiva,
                dias: diasSemanaFechas.map(d => ({ fecha: d.fechaStr, dia: d.diaNombre })),
            },
        };
    }


    async findMine(user: ActiveUserDto, companyId: number, startDateStr?: string) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const authUser = await this.prisma.auth_user.findUnique({
            where: { id: user.id },
            include: { Empleados: { select: { idEmpleado: true }, take: 1 } },
        });

        if (!authUser?.Empleados?.[0]?.idEmpleado) {
            throw new InternalServerErrorException('El usuario no tiene un empleado asociado.');
        }

        const empId = authUser.Empleados[0].idEmpleado;
        const { lunes, domingo, diasSemanaFechas } = this.getWeekRange(startDateStr);
        const anioConsulta = lunes.getFullYear();

        let horasSemanalesLimite = 48.0;
        let isReformaActiva = false;

        const configLegal = await this.prisma.configuracionJornadaLegal.findFirst({
            where: { idEmpresa: companyId, idTenant: user.idTenant, anio: anioConsulta, activo: true },
            select: { horasSemana: true },
        });

        if (configLegal && configLegal.horasSemana) {
            horasSemanalesLimite = Number(configLegal.horasSemana);
            isReformaActiva = true;
        }

        const limiteMinutosLegal = Math.round(horasSemanalesLimite * 60);

        const empleado = await this.prisma.$queryRaw<any[]>`
            SELECT 
                ep.idEmpleado,
                ep.numeroEmpleado,
                TRIM(CONCAT(ep.nombre, ' ', ep.primerApellido, ' ', COALESCE(ep.segundoApellido, ''))) AS nombreCompleto,
                p.NombrePuesto AS puesto,
                COALESCE(cm.Descripcion, 'Turno Estándar') AS turno
            FROM Empleados ep
            LEFT JOIN CatPuestos p ON p.idPuesto = ep.idPuesto
            LEFT JOIN CatModalidad cm ON cm.idModalidad = ep.idModalidad
            WHERE ep.idEmpleado = ${empId} AND ep.idEmpresa = ${companyId} AND ep.idTenant = ${user.idTenant}
        `;

        if (empleado.length === 0) {
            throw new InternalServerErrorException('No se encontró el registro de empleado.');
        }

        const fechaInicioStr = lunes.toISOString().split('T')[0];
        const fechaFinStr = domingo.toISOString().split('T')[0];

        const jornadas = await this.prisma.$queryRaw<any[]>`
            SELECT idJornada, idEmpleado, DATE_FORMAT(fecha, '%Y-%m-%d') as fecha,
                   horaEntradaReal, horaSalidaReal, minutosTrabajados, minutosRetardo, estatusJornada
            FROM JornadasEmpleado
            WHERE idEmpleado = ${empId} AND fecha >= ${fechaInicioStr} AND fecha <= ${fechaFinStr}
        `;

        const horariosProgramados = await this.prisma.horariosEmpleado.findMany({
            where: { idEmpleado: empId },
            select: { DiaSemana: true },
        });

        let totalMinutosSemana = 0;
        const semanaDias = diasSemanaFechas.map(({ fechaStr, diaNombre }) => {
            const jornadaDia = jornadas.find(j => j.fecha === fechaStr);
            const tieneHorarioConfigurado = horariosProgramados.some(h => h.DiaSemana === diaNombre);

            if (jornadaDia) {
                const minutos = Number(jornadaDia.minutosTrabajados) || 0;
                totalMinutosSemana += minutos;
                let displayTexto = this.formatMinutosAHora(minutos);
                let variant: string = 'cerrada';
                if (jornadaDia.estatusJornada === 'CIERRE_AUTOMATICO') { displayTexto = `${displayTexto} auto`; variant = 'cierre_automatico'; }
                else if (jornadaDia.estatusJornada === 'ABIERTA' || jornadaDia.estatusJornada === 'INCOMPLETA') { displayTexto = 'Sin salida'; variant = 'incompleta'; }
                else if (jornadaDia.estatusJornada === 'FALTA') { displayTexto = 'Falta'; variant = 'falta'; }

                return { fecha: fechaStr, dia: diaNombre, texto: displayTexto, minutos, estatus: jornadaDia.estatusJornada, variant, minutosRetardo: Number(jornadaDia.minutosRetardo) || 0, horaEntrada: jornadaDia.horaEntradaReal, horaSalida: jornadaDia.horaSalidaReal };
            }

            if (!tieneHorarioConfigurado) {
                return { fecha: fechaStr, dia: diaNombre, texto: 'Descanso', minutos: 0, estatus: 'DESCANSO', variant: 'descanso', minutosRetardo: 0, horaEntrada: null, horaSalida: null };
            }

            const yaPaso = new Date(`${fechaStr}T23:59:59`) < new Date();
            return { fecha: fechaStr, dia: diaNombre, texto: yaPaso ? 'Falta' : '-', minutos: 0, estatus: yaPaso ? 'FALTA' : 'PENDIENTE', variant: yaPaso ? 'falta' : 'descanso', minutosRetardo: 0, horaEntrada: null, horaSalida: null };
        });

        const porcentajeCumplimiento = Number(((totalMinutosSemana / limiteMinutosLegal) * 100).toFixed(1));

        return {
            idEmpleado: empId,
            numeroEmpleado: empleado[0].numeroEmpleado,
            nombreCompleto: empleado[0].nombreCompleto,
            puesto: empleado[0].puesto,
            turno: empleado[0].turno,
            dias: semanaDias,
            totalHorasSemana: this.formatMinutosAHora(totalMinutosSemana),
            totalMinutosSemana,
            porcentajeCumplimiento,
            semana: {
                inicio: fechaInicioStr,
                fin: fechaFinStr,
                anio: anioConsulta,
                horasLimiteLegal: horasSemanalesLimite,
                reformaActiva: isReformaActiva,
            },
        };
    }

    async findDayDetails(
        user: ActiveUserDto,
        companyId: number,
        employeeId: number,
        dateStr: string,
    ) {
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            throw new BadRequestException('El parámetro date es requerido y debe tener formato YYYY-MM-DD');
        }

        // 1. Validar que el empleado exista en la empresa y tenant
        const empleado = await this.prisma.empleados.findFirst({
            where: {
                idEmpleado: employeeId,
                idEmpresa: companyId,
                ...(user.idTenant && { idTenant: user.idTenant }),
            },
            select: {
                idEmpleado: true,
                numeroEmpleado: true,
                nombre: true,
                primerApellido: true,
                segundoApellido: true,
                CatPuestos: {
                    select: {
                        DescripcionPuesto: true,
                    },
                },
            },
        });

        if (!empleado) {
            throw new NotFoundException(`No se encontró el colaborador con ID ${employeeId}`);
        }

        // 2. Resolver la fecha de la jornada como medianoche UTC (formato @db.Date de Prisma)
        const [year, month, day] = dateStr.split('-').map(Number);
        const fechaJornada = new Date(Date.UTC(year, month - 1, day));

        // 3. Consultar primero la jornada del colaborador para esta fecha
        const jornada = await this.prisma.jornadasEmpleado.findFirst({
            where: {
                idEmpleado: employeeId,
                fecha: fechaJornada,
            },
        });

        // 4. Consultar los marcajes vinculados a la jornada (o por ventana de tiempo si no hay jornada)
        const registros = jornada
            ? await this.prisma.registrosAsistencia.findMany({
                where: {
                    idJornada: jornada.idJornada,
                    idEmpresa: companyId,
                    ...(user.idTenant && { idTenant: user.idTenant }),
                },
                orderBy: {
                    fechaHoraRegistro: 'asc',
                },
            })
            : await this.prisma.registrosAsistencia.findMany({
                where: {
                    idEmpleado: employeeId,
                    idEmpresa: companyId,
                    ...(user.idTenant && { idTenant: user.idTenant }),
                    // Ventana de 24 horas cubriendo el día local en UTC (ej. 06:00 UTC del día a 05:59:59 UTC del día siguiente)
                    fechaHoraRegistro: {
                        gte: new Date(`${dateStr}T06:00:00.000Z`),
                        lte: new Date(new Date(`${dateStr}T06:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 - 1),
                    },
                },
                orderBy: {
                    fechaHoraRegistro: 'asc',
                },
            });

        // 5. Resolver nombres de sedes (CatSites) para los idSitioDetectado presentes
        const siteIds = Array.from(
            new Set(
                registros
                    .map((r) => r.idSitioDetectado)
                    .filter((id): id is number => id !== null && id !== undefined),
            ),
        );

        const siteMap = new Map<number, string>();
        if (siteIds.length > 0) {
            const sites = await this.prisma.catSites.findMany({
                where: {
                    idSite: { in: siteIds },
                },
                select: {
                    idSite: true,
                    Descripcion: true,
                },
            });

            sites.forEach((s) => {
                siteMap.set(s.idSite, s.Descripcion!);
            });
        }

        // 6. Mapear cada checada
        const marcajes = registros.map((reg) => {
            let syncLabel = 'En línea';
            if (reg.esOffline) {
                syncLabel = 'Offline';
            } else if (reg.idExternoArtemis || reg.idDispositivoArtemis) {
                syncLabel = 'Artemis';
            } else if (reg.canal === 'WEB_MANUAL') {
                syncLabel = 'Manual';
            }

            const ubicacionNombre = reg.idSitioDetectado
                ? (siteMap.get(reg.idSitioDetectado) ?? `Sitio #${reg.idSitioDetectado}`)
                : (reg.nombreDispositivo ?? null);

            return {
                idRegistro: reg.idRegistro.toString(),
                idJornada: reg.idJornada,
                tipo: reg.tipo,
                canal: reg.canal,
                fechaHoraRegistro: reg.fechaHoraRegistro,
                ubicacionDispositivo: ubicacionNombre,
                idSitioDetectado: reg.idSitioDetectado,
                nombreDispositivo: reg.nombreDispositivo,
                geocerca: {
                    resultado: reg.resultadoGeocerca,
                    latitud: reg.latitud ? Number(reg.latitud) : null,
                    longitud: reg.longitud ? Number(reg.longitud) : null,
                },
                evidencia: {
                    tieneFoto: Boolean(reg.urlFoto),
                    urlFoto: reg.urlFoto ?? null,
                },
                sync: {
                    label: syncLabel,
                    esOffline: Boolean(reg.esOffline),
                    fechaHoraRecepcion: reg.fechaHoraRecepcion,
                },
                estatusProcesamiento: reg.estatusProcesamiento,
            };
        });

        // 7. Formatear minutos a horas y minutos (ej. 493 -> "8:13")
        const minutos = jornada?.minutosTrabajados ?? 0;
        const horasNum = Math.floor(minutos / 60);
        const minsNum = minutos % 60;
        const textoHoras = minutos > 0 ? `${horasNum}:${minsNum.toString().padStart(2, '0')}` : '-';

        return {
            empleado: {
                idEmpleado: empleado.idEmpleado,
                numeroEmpleado: empleado.numeroEmpleado,
                nombreCompleto: [empleado.nombre, empleado.primerApellido, empleado.segundoApellido].filter(Boolean).join(' '),
                puesto: empleado.CatPuestos?.DescripcionPuesto ?? null,
            },
            jornada: jornada
                ? {
                    idJornada: jornada.idJornada,
                    fecha: dateStr,
                    estatus: jornada.estatusJornada,
                    minutosTrabajados: jornada.minutosTrabajados,
                    totalHorasTexto: textoHoras,
                    horaEntradaReal: jornada.horaEntradaReal,
                    horaSalidaReal: jornada.horaSalidaReal,
                    horaEntradaTeorica: jornada.horaEntradaTeorica,
                    horaSalidaTeorica: jornada.horaSalidaTeorica,
                    minutosRetardo: jornada.minutosRetardo,
                }
                : null,
            marcajes,
        };
    }

    // -------------------------------
    // Helpers
    // -------------------------------

    private getWeekRange(startDateStr?: string) {
        let baseDate = startDateStr ? new Date(`${startDateStr}T00:00:00`) : new Date();
        if (isNaN(baseDate.getTime())) baseDate = new Date();

        const day = baseDate.getDay();
        const diffToMonday = (day === 0 ? -6 : 1) - day;

        const lunes = new Date(baseDate);
        lunes.setDate(baseDate.getDate() + diffToMonday);
        lunes.setHours(0, 0, 0, 0);

        const domingo = new Date(lunes);
        domingo.setDate(lunes.getDate() + 6);
        domingo.setHours(23, 59, 59, 999);

        const diasSemanaFechas: { fechaStr: string; diaNombre: string }[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(lunes);
            d.setDate(lunes.getDate() + i);
            diasSemanaFechas.push({
                fechaStr: d.toISOString().split('T')[0],
                diaNombre: DIAS_CLAVE[i],
            });
        }

        return { lunes, domingo, diasSemanaFechas };
    }

    private formatMinutosAHora(totalMinutos: number): string {
        const horas = Math.floor(totalMinutos / 60);
        const mins = totalMinutos % 60;
        return `${horas}:${String(mins).padStart(2, '0')}`;
    }
}