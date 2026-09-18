import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ArtemisClockInDto } from './dto/artemis-clock-in.dto';

const DIAS_MAP: Record<number, string> = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
};

@Injectable()
export class ArtemisService {
    private readonly logger = new Logger(ArtemisService.name);

    constructor(private readonly prisma: PrismaService) { }

    async clockIn(dto: ArtemisClockInDto) {
        const idExternoBigInt = BigInt(dto.IdAsistencia);

        // 1. Idempotencia: validar si este registro de Artemis ya fue recibido
        const yaExiste = await this.prisma.registrosAsistencia.findFirst({
            where: { idExternoArtemis: idExternoBigInt },
            select: { idRegistro: true, tipo: true, idJornada: true },
        });

        if (yaExiste) {
            this.logger.warn(`Marcaje duplicado recibido de Artemis. IdAsistencia: ${dto.IdAsistencia}`);
            return {
                success: true,
                duplicado: true,
                message: 'Marcaje previamente registrado.',
                idRegistro: Number(yaExiste.idRegistro),
                tipo: yaExiste.tipo,
            };
        }

        // 2. Buscar al empleado por su número de empleado (ExternalUserId)
        const numeroEmpleado = dto.ExternalUserId.trim();
        const empleado = await this.prisma.empleados.findFirst({
            where: {
                numeroEmpleado,
                activo: true,
            },
            select: {
                idEmpleado: true,
                idEmpresa: true,
                idTenant: true,
                nombre: true,
                primerApellido: true,
            },
        });

        if (!empleado) {
            this.logger.error(`Empleado no encontrado o inactivo con número: ${numeroEmpleado}`);
            throw new NotFoundException(`No se encontró un empleado activo con el número de colaborador "${numeroEmpleado}".`);
        }

        // 3. Normalizar canal según FuenteAsistencia
        let canal: 'IVR' | 'BIOMETRICO' | 'NFC' = 'BIOMETRICO';
        const fuenteUpper = (dto.FuenteAsistencia || '').toUpperCase();
        if (fuenteUpper.includes('IVR')) {
            canal = 'IVR';
        } else if (fuenteUpper.includes('NFC')) {
            canal = 'NFC';
        }

        // 4. Fechas y día de la semana (Sanitización y forzado a UTC)
        let fechaRaw = (dto.FechaChecada || '').trim();

        // Si viene sin indicador de zona horaria ('Z' o '+/-HH:mm'), forzamos UTC
        if (!fechaRaw.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(fechaRaw)) {
            if (fechaRaw.includes('.')) {
                const [fechaParte, decimales] = fechaRaw.split('.');
                // JS Date solo acepta hasta 3 dígitos de milisegundos
                fechaRaw = `${fechaParte}.${decimales.slice(0, 3)}Z`;
            } else {
                fechaRaw = `${fechaRaw}Z`;
            }
        }

        const fechaChecadaDate = new Date(fechaRaw);
        if (isNaN(fechaChecadaDate.getTime())) {
            throw new BadRequestException('FechaChecada inválida');
        }

        // Fecha solo (YYYY-MM-DD) para asociar la jornada diaria
        const fechaSoloStr = fechaChecadaDate.toISOString().split('T')[0];
        const fechaJornada = new Date(fechaSoloStr);
        const diaSemanaNombre = DIAS_MAP[fechaChecadaDate.getUTCDay()];

        return await this.prisma.$transaction(async (tx: any) => {
            // 5. Buscar si existe un horario programado para el día de hoy
            const horarioDia = await tx.horariosEmpleado.findFirst({
                where: {
                    idEmpleado: empleado.idEmpleado,
                    DiaSemana: diaSemanaNombre,
                },
            });

            // 6. Buscar si ya existe una jornada para este empleado en esta fecha
            let jornada = await tx.jornadasEmpleado.findFirst({
                where: {
                    idEmpleado: empleado.idEmpleado,
                    fecha: fechaJornada,
                },
            });

            let tipoChecada: 'ENTRADA' | 'SALIDA' = 'ENTRADA';

            if (!jornada) {
                // Primera checada del día -> Entrada
                tipoChecada = 'ENTRADA';

                let minutosRetardo = 0;
                let horaEntradaTeorica: Date | null = null;
                let horaSalidaTeorica: Date | null = null;

                if (horarioDia) {
                    horaEntradaTeorica = horarioDia.HoraEntrada;
                    horaSalidaTeorica = horarioDia.HoraSalida;

                    // Calcular retardo si hay hora teórica de entrada
                    if (horaEntradaTeorica) {
                        const [thHora, thMin] = horaEntradaTeorica.toString().split(':').map(Number);
                        const teoricaDate = new Date(fechaChecadaDate);
                        teoricaDate.setUTCHours(thHora, thMin, 0, 0);

                        const diffMinutos = Math.floor((fechaChecadaDate.getTime() - teoricaDate.getTime()) / 60000);
                        if (diffMinutos > 0) {
                            minutosRetardo = diffMinutos;
                        }
                    }
                }

                jornada = await tx.jornadasEmpleado.create({
                    data: {
                        idTenant: empleado.idTenant,
                        idEmpresa: empleado.idEmpresa,
                        idEmpleado: empleado.idEmpleado,
                        fecha: fechaJornada,
                        horaEntradaTeorica,
                        horaSalidaTeorica,
                        horaEntradaReal: fechaChecadaDate,
                        minutosRetardo,
                        estatusJornada: 'ABIERTA',
                    },
                });
            } else {
                // Ya existe jornada -> Se evalúa como Salida
                tipoChecada = 'SALIDA';

                const entradaReal = jornada.horaEntradaReal ? new Date(jornada.horaEntradaReal) : fechaChecadaDate;
                const minutosTrabajados = Math.max(0, Math.floor((fechaChecadaDate.getTime() - entradaReal.getTime()) / 60000));

                jornada = await tx.jornadasEmpleado.update({
                    where: { idJornada: jornada.idJornada },
                    data: {
                        horaSalidaReal: fechaChecadaDate,
                        minutosTrabajados,
                        estatusJornada: 'CERRADA',
                    },
                });
            }

            // 7. Guardar el registro puntual de asistencia
            const nuevoRegistro = await tx.registrosAsistencia.create({
                data: {
                    idTenant: empleado.idTenant,
                    idEmpresa: empleado.idEmpresa,
                    idEmpleado: empleado.idEmpleado,
                    idJornada: jornada.idJornada,
                    canal,
                    tipo: tipoChecada,
                    fechaHoraRegistro: fechaChecadaDate,
                    idExternoArtemis: idExternoBigInt,
                    idDispositivoArtemis: dto.IdDispositivo ?? null,
                    nombreDispositivo: dto.Dispositivo ?? null,
                    urlFoto: dto.UrlFoto ?? null,
                    estatusProcesamiento: 'PROCESADO',
                },
            });

            this.logger.log(
                `Asistencia procesada [${tipoChecada}] para ${empleado.nombre} ${empleado.primerApellido} (#${numeroEmpleado}) vía ${canal}`,
            );

            return {
                message: `Checada de ${tipoChecada.toLowerCase()} registrada exitosamente.`,
                idRegistro: Number(nuevoRegistro.idRegistro),
                idJornada: jornada.idJornada,
                tipo: tipoChecada,
                empleado: `${empleado.nombre} ${empleado.primerApellido}`,
                fechaHora: fechaChecadaDate,
            };
        });
    }
}