import { Injectable, Logger } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AttendanceDashboardResponseDto } from './dto/attendance-dashboard-response.dto';

@Injectable()
export class AttendanceDashboardService {
    private readonly logger = new Logger(AttendanceDashboardService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getMetrics(
        user: ActiveUserDto,
        companyId: number,
        targetDate?: string,
    ): Promise<AttendanceDashboardResponseDto> {
        const queryDate = targetDate || new Date().toISOString().split('T')[0];
        const startOfDay = `${queryDate} 00:00:00`;
        const endOfDay = `${queryDate} 23:59:59`;

        // 1. Obtener el día de la semana correspondiente a queryDate
        // Usamos el desglose de partes para evitar desajustes de huso horario
        const [y, m, d] = queryDate.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const diaSemana = diasSemana[dateObj.getDay()];

        try {
            const [
                resumenJornadas,
                esperadosResult,
                conteoPorCanal,
                conteoPorHora,
                ultimosRegistros,
            ] = await Promise.all([
                // 1. Métricas agregadas de Jornadas del día
                this.prisma.jornadasEmpleado.groupBy({
                    by: ['estatusJornada'],
                    where: {
                        idEmpresa: companyId,
                        ...(user.idTenant && { idTenant: user.idTenant }),
                        fecha: new Date(`${queryDate}T00:00:00`),
                        Empleados: { activo: true },
                    },
                    _count: { idJornada: true },
                }),

                // 2. Empleados activos esperados hoy con turno presencial
                this.prisma.$queryRaw<Array<{ totalEsperados: bigint }>>`
          SELECT COUNT(DISTINCT h.idEmpleado) AS totalEsperados
          FROM HorariosEmpleado h
          INNER JOIN Empleados ep ON ep.idEmpleado = h.idEmpleado
          WHERE ep.idEmpresa = ${companyId}
            AND ep.idTenant = ${user.idTenant}
            AND ep.activo = 1
            AND h.DiaSemana = ${diaSemana}
            AND h.HoraEntrada IS NOT NULL
            AND (
              h.Modalidad IS NULL 
              OR (
                LOWER(h.Modalidad) NOT LIKE '%remoto%' 
                AND LOWER(h.Modalidad) NOT LIKE '%home%'
              )
            )
        `,

                // 3. Distribución multicanal de marcas en el día
                this.prisma.registrosAsistencia.groupBy({
                    by: ['canal'],
                    where: {
                        idEmpresa: companyId,
                        ...(user.idTenant && { idTenant: user.idTenant }),
                        fechaHoraRegistro: {
                            gte: new Date(startOfDay),
                            lte: new Date(endOfDay),
                        },
                        Empleados: { activo: true },
                    },
                    _count: { idRegistro: true },
                }),

                // 4. Actividad distribuida por hora (agrupada en SQL puro)
                this.prisma.$queryRaw<Array<{ hora: number; tipo: string; total: bigint }>>`
          SELECT 
            HOUR(fechaHoraRegistro) as hora,
            tipo,
            COUNT(idRegistro) as total
          FROM RegistrosAsistencia
          WHERE idEmpresa = ${companyId}
            AND idTenant = ${user.idTenant}
            AND fechaHoraRegistro BETWEEN ${startOfDay} AND ${endOfDay}
          GROUP BY HOUR(fechaHoraRegistro), tipo
          ORDER BY hora ASC
        `,

                // 5. Feed en vivo: últimos 7 registros procesados
                this.prisma.registrosAsistencia.findMany({
                    where: {
                        idEmpresa: companyId,
                        ...(user.idTenant && { idTenant: user.idTenant }),
                        fechaHoraRegistro: {
                            gte: new Date(startOfDay),
                            lte: new Date(endOfDay),
                        },
                        Empleados: { activo: true },
                    },
                    take: 7,
                    orderBy: { fechaHoraRegistro: 'desc' },
                    include: {
                        Empleados: {
                            select: {
                                numeroEmpleado: true,
                                nombre: true,
                                primerApellido: true,
                                segundoApellido: true,
                            },
                        },
                    },
                }),
            ]);

            // --- Normalización de KPIs ---
            const totalEsperados = Number(esperadosResult[0]?.totalEsperados ?? 0);
            let abiertas = 0;
            let faltas = 0;

            resumenJornadas.forEach((j) => {
                if (j.estatusJornada === 'ABIERTA') abiertas += j._count.idJornada;
                if (j.estatusJornada === 'FALTA') faltas += j._count.idJornada;
            });

            // Retardos calculados del día
            const retardosCount = await this.prisma.jornadasEmpleado.count({
                where: {
                    idEmpresa: companyId,
                    ...(user.idTenant && { idTenant: user.idTenant }),
                    fecha: new Date(`${queryDate}T00:00:00`),
                    minutosRetardo: { gt: 0 },
                },
            });

            const presentes = abiertas; // Quienes tienen check-in activo
            const pctAsistencia = totalEsperados > 0 ? Math.round((presentes / totalEsperados) * 100) : 0;
            const pctPlantillaAusente = totalEsperados > 0 ? Math.round((faltas / totalEsperados) * 100) : 0;

            // --- Normalización de Canales ---
            const totalMarcas = conteoPorCanal.reduce((acc, curr) => acc + curr._count.idRegistro, 0);
            const canalLabels: Record<string, string> = {
                APP_MOVIL: 'App móvil',
                IVR: 'IVR Telefónico',
                BIOMETRICO: 'Biométrico Artemis',
                NFC: 'NFC Artemis',
                WEB_MANUAL: 'Portal Web RH',
            };

            const distribucionCanales = conteoPorCanal.map((item) => ({
                canal: item.canal,
                label: canalLabels[item.canal] || item.canal,
                total: item._count.idRegistro,
                porcentaje: totalMarcas > 0 ? Math.round((item._count.idRegistro / totalMarcas) * 100) : 0,
            }));

            // --- Normalización de Curva Horaria (06:00 a 22:00) ---
            const horasMap = new Map<number, { entradas: number; salidas: number }>();
            for (let h = 6; h <= 22; h++) {
                horasMap.set(h, { entradas: 0, salidas: 0 });
            }

            conteoPorHora.forEach((row) => {
                const item = horasMap.get(row.hora);
                if (item) {
                    const qty = Number(row.total);
                    if (row.tipo === 'ENTRADA') item.entradas += qty;
                    if (row.tipo === 'SALIDA') item.salidas += qty;
                }
            });

            const actividadPorHora = Array.from(horasMap.entries()).map(([h, vals]) => ({
                hora: `${String(h).padStart(2, '0')}:00`,
                entradas: vals.entradas,
                salidas: vals.salidas,
                total: vals.entradas + vals.salidas,
            }));

            // --- Normalización Feed en Vivo ---
            const ultimosMovimientos = ultimosRegistros.map((reg) => ({
                idRegistro: reg.idRegistro.toString(),
                nombreCompleto: [reg.Empleados?.nombre, reg.Empleados?.primerApellido]
                    .filter(Boolean)
                    .join(' '),
                numeroEmpleado: reg.Empleados?.numeroEmpleado || null,
                tipo: reg.tipo,
                canal: canalLabels[reg.canal] || reg.canal,
                dispositivo: reg.nombreDispositivo ?? (reg.idSitioDetectado ? `Sitio #${reg.idSitioDetectado}` : null),
                fechaHora: typeof reg.fechaHoraRegistro === 'string'
                    ? reg.fechaHoraRegistro
                    : reg.fechaHoraRegistro.toISOString(),
            }));

            return {
                resumenKpis: {
                    presentes: {
                        total: presentes,
                        esperados: totalEsperados,
                        porcentajeAsistencia: pctAsistencia,
                    },
                    ausentes: {
                        total: faltas,
                        porcentajePlantilla: pctPlantillaAusente,
                    },
                    retardos: {
                        total: retardosCount,
                    },
                    jornadasAbiertas: {
                        total: abiertas,
                    },
                    excepciones: {
                        total: 0,
                        pendientesValidacion: 0,
                    },
                },
                distribucionCanales,
                actividadPorHora,
                ultimosMovimientos,
            };
        } catch (error) {
            this.logger.error(`Error procesando métricas del dashboard de asistencia para empresa ${companyId}`, error);
            throw error;
        }
    }
}