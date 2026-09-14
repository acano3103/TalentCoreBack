import { Injectable, InternalServerErrorException } from '@nestjs/common';
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

        // 4. Conteo de empleados con expediente completo (idEstatus = 4)
        const countResult = await this.prisma.$queryRaw<{ total: bigint }[]>`
            SELECT COUNT(DISTINCT ep.idEmpleado) as total
            FROM Empleados ep
            JOIN Expedientes exp ON exp.idEmpleado = ep.idEmpleado AND exp.idTenant = ep.idTenant
            WHERE ep.idEmpresa = ${companyId}
                AND ep.idTenant = ${user.idTenant}
                AND ep.activo = 1
                AND exp.idEstatus = 4
                ${searchFilter}
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
                AND exp.idEstatus = 4
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