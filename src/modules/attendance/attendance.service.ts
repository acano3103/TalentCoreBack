import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AttendanceTrackingConfigService } from '../config/attendance-config/attendance-config.service';

@Injectable()
export class AttendanceService {
    private readonly logger = new Logger(AttendanceService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly attendanceConfigService: AttendanceTrackingConfigService
    ) { }

    async getUserAttendance(user: ActiveUserDto, companyId: number, employeeId: number) {
        // 1. Localizar al colaborador
        const empleado = await this.prisma.empleados.findFirst({
            where: {
                idEmpleado: employeeId,
                idTenant: user.idTenant,
                activo: true,
            },
            select: {
                idEmpleado: true,
                numeroEmpleado: true,
                nombre: true,
                primerApellido: true,
                segundoApellido: true,
                idPuesto: true,
                curp: true,
            },
        });

        if (!empleado) {
            throw new NotFoundException('No tienes un perfil de empleado activo vinculado a esta empresa.');
        }

        // 2. Obtener configuración centralizada mediante el servicio del módulo
        const config = await this.attendanceConfigService.getConfiguracionAsistencia(user.idTenant, companyId);

        // Extraer los parámetros operativos esenciales para la vista del empleado
        const reglasOperativas = {
            minutosToleranciaEntrada: config.tolerancia.minutosToleranciaEntrada,
            minutosLimiteRetardo: config.tolerancia.minutosLimiteRetardo,
            acumulacionRetardosParaFalta: config.tolerancia.acumulacionRetardosParaFalta,
            tiempoComidaMinutos: config.comida.tiempoComidaMinutos,
            toleranciaSalidaAnticipadaMinutos: config.salidas.toleranciaSalidaAnticipadaMinutos,
        };

        // 3. Consultar el histórico de jornadas con sus checadas
        const jornadas = await this.prisma.jornadasEmpleado.findMany({
            where: {
                idEmpleado: empleado.idEmpleado,
                idTenant: user.idTenant,
                idEmpresa: companyId,
            },
            include: {
                RegistrosAsistencia: {
                    orderBy: {
                        fechaHoraRegistro: 'asc',
                    },
                    select: {
                        idRegistro: true,
                        canal: true,
                        tipo: true,
                        fechaHoraRegistro: true,
                        resultadoGeocerca: true,
                        nombreDispositivo: true,
                    },
                },
            },
            orderBy: {
                fecha: 'desc',
            },
            take: 31,
        });

        // 4. Métricas operativas
        let totalMinutosTrabajados = 0;
        let totalMinutosRetardo = 0;
        let diasAsistidos = 0;
        let totalFaltas = 0;

        const detalleJornadas = jornadas.map((jornada: any) => {
            totalMinutosTrabajados += jornada.minutosTrabajados || 0;
            totalMinutosRetardo += jornada.minutosRetardo || 0;

            if (jornada.estatusJornada === 'FALTA') {
                totalFaltas += 1;
            } else if (['CERRADA', 'ABIERTA', 'CIERRE_AUTOMATICO'].includes(jornada.estatusJornada)) {
                diasAsistidos += 1;
            }

            const entrada = jornada.RegistrosAsistencia.find((r: any) => r.tipo === 'ENTRADA');
            const salidaComida = jornada.RegistrosAsistencia.find((r: any) => r.tipo === 'INICIO_COMIDA');
            const entradaComida = jornada.RegistrosAsistencia.find((r: any) => r.tipo === 'FIN_COMIDA');
            const salida = jornada.RegistrosAsistencia.filter((r: any) => r.tipo === 'SALIDA').pop();

            return {
                idJornada: jornada.idJornada,
                fecha: jornada.fecha,
                estatusJornada: jornada.estatusJornada,
                minutosTrabajados: jornada.minutosTrabajados,
                horasTrabajadasFormato: `${Math.floor(jornada.minutosTrabajados / 60)}h ${jornada.minutosTrabajados % 60}m`,
                minutosRetardo: jornada.minutosRetardo,
                horasTeoricas: {
                    entrada: jornada.horaEntradaTeorica,
                    salida: jornada.horaSalidaTeorica,
                },
                horasReales: {
                    entrada: jornada.horaEntradaReal,
                    salida: jornada.horaSalidaReal,
                },
                marcajes: {
                    entrada: entrada ? { hora: entrada.fechaHoraRegistro, canal: entrada.canal } : null,
                    salidaComida: salidaComida ? { hora: salidaComida.fechaHoraRegistro, canal: salidaComida.canal } : null,
                    entradaComida: entradaComida ? { hora: entradaComida.fechaHoraRegistro, canal: entradaComida.canal } : null,
                    salida: salida ? { hora: salida.fechaHoraRegistro, canal: salida.canal } : null,
                },
                totalRegistros: jornada.RegistrosAsistencia.length,
            };
        });

        const totalHoras = (totalMinutosTrabajados / 60).toFixed(1);

        return {
            empleado: {
                idEmpleado: empleado.idEmpleado,
                numeroEmpleado: empleado.numeroEmpleado,
                nombreCompleto: `${empleado.nombre} ${empleado.primerApellido} ${empleado.segundoApellido || ''}`.trim(),
            },
            reglasOperativas, // Devuelto desde attendanceConfigService
            resumen: {
                diasAsistidos,
                totalFaltas,
                horasTrabajadas: Number(totalHoras),
                minutosRetardoAcumulados: totalMinutosRetardo,
            },
            jornadas: detalleJornadas,
        };
    }
}