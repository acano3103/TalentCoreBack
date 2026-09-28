import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import { CanonicalCheck } from 'src/modules/attendance/engine/interfaces/canonical-check.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { DIAS_MAP, VENTANA_DUPLICADO_SEGUNDOS } from './constans/constans';
import { ArtemisClockInDto } from './dto/artemis-clock-in.dto';
import { ArtemisDeviceItemDto, TipoDispositivoEnum } from './dto/artemis-device.dto';
import { resolverTenantUnico } from '../utils/resolver-tenant-unico.util';

@Injectable()
export class ArtemisService {
    private readonly logger = new Logger(ArtemisService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly engine: AttendanceEngineService,
    ) { }

    /**
     * Procesa el registro de asistencia desde Artemis (biométrico, NFC e IVR).
     *
     * TODO(artemis): borrar clockInLegacy y la bandera ATTENDANCE_ENGINE_ENABLED
     * cuando el motor lleve dos semanas estable en producción. Sin la bandera,
     * un problema obliga a rollback de deploy; con ella, es un cambio de env.
     */
    async clockIn(dto: ArtemisClockInDto) {
        if (!this.motorHabilitado()) {
            return this.clockInLegacy(dto);
        }
        return this.clockInConMotor(dto);
    }

    private motorHabilitado(): boolean {
        return (process.env.ATTENDANCE_ENGINE_ENABLED ?? 'true') !== 'false';
    }

    private async clockInConMotor(dto: ArtemisClockInDto) {
        const idExternoBigInt = BigInt(dto.IdAsistencia);

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

        const idTenant = await resolverTenantUnico(this.prisma);
        const numeroEmpleado = dto.ExternalUserId.trim();
        const empleado = await this.prisma.empleados.findFirst({
            where: {
                numeroEmpleado,
                activo: true,
                idTenant,
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

        const canal = this.normalizarCanal(dto.FuenteAsistencia);
        const fechaChecadaDate = this.sanitizarFechaChecada(dto.FechaChecada);
        const idSite = await this.resolverSitio(dto, empleado.idEmpleado, numeroEmpleado);

        const check: CanonicalCheck = {
            idTenant: empleado.idTenant ?? idTenant,
            idEmpresa: empleado.idEmpresa as number,
            idEmpleado: empleado.idEmpleado,
            canal,
            tipo: null,
            modoInferencia: 'ALTERNANTE_SIMPLE',
            rechazoSuave: true,
            fechaHoraRegistro: fechaChecadaDate,
            idExternoArtemis: idExternoBigInt,
            idDispositivoArtemis: dto.IdDispositivo ?? null,
            idSitioDetectado: idSite,
            nombreDispositivo: dto.Dispositivo ?? null,
            urlFoto: dto.UrlFoto ?? null,
        };

        const resultado = await this.engine.registerCheck(check);

        if (resultado.rechazado) {
            this.logger.warn(
                `Checada rechazada [${resultado.codigoRechazo}] para #${numeroEmpleado}: ${resultado.motivoRechazo}`,
            );
            return {
                message: resultado.motivoRechazo,
                rechazado: true,
                codigo: resultado.codigoRechazo,
                idRegistro: Number(resultado.idRegistro),
                idJornada: resultado.idJornada,
            };
        }

        return {
            message: `Checada de ${resultado.tipo.toLowerCase()} registrada exitosamente.`,
            idRegistro: Number(resultado.idRegistro),
            idJornada: resultado.idJornada,
            tipo: resultado.tipo,
            empleado: `${empleado.nombre} ${empleado.primerApellido}`,
            fechaHora: fechaChecadaDate,
            ...(resultado.duplicado ? { duplicado: true } : {}),
            ...(resultado.motivoDuplicado === 'ANTIREBOTE'
                ? { ignoradoPorTolerancia: true }
                : {}),
        };
    }

    private normalizarCanal(fuente: string): 'IVR' | 'BIOMETRICO' | 'NFC' {
        let canal: 'IVR' | 'BIOMETRICO' | 'NFC' = 'BIOMETRICO';
        const fuenteUpper = (fuente || '').toUpperCase();
        if (fuenteUpper.includes('IVR')) {
            canal = 'IVR';
        } else if (fuenteUpper.includes('NFC')) {
            canal = 'NFC';
        }
        return canal;
    }

    private sanitizarFechaChecada(fecha: string): Date {
        let fechaRaw = (fecha || '').trim();

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
        return fechaChecadaDate;
    }

    /**
     * Resuelve la sede (idSite) desde la que llega el marcaje.
     *
     * Biométrico / NFC: por el dispositivo registrado en CatDispositivos.
     * IVR: por el DID, primero como excepción EXTRA del empleado y si no,
     * por el catálogo general de sedes, validando que el DID no esté
     * bloqueado para ese colaborador.
     *
     * Lo usan tanto clockInConMotor como clockInLegacy: es una regla de
     * negocio del proveedor, no del motor.
     */
    private async resolverSitio(
        dto: ArtemisClockInDto,
        idEmpleado: number,
        numeroEmpleado: string,
    ): Promise<number | null> {
        let idSite: number | null = null;

        // Caso 1: Biométrico / NFC (por dispositivo)
        if (dto.IdDispositivo) {
            const dispositivo = await this.prisma.catDispositivos.findFirst({
                where: {
                    idDispositivoArtemis: dto.IdDispositivo,
                },
            });

            if (!dispositivo) {
                throw new NotFoundException(`Dispositivo no encontrado con idExternoArtemis: ${dto.IdDispositivo}`);
            }

            idSite = dispositivo.idSite;
        }

        // Caso 2: IVR (por número telefónico)
        if (dto.NumeroTelefono) {
            const telefonoLimpio = dto.NumeroTelefono.trim();

            // A. Primero verificamos si es un número personalizado (EXTRA) asignado al empleado
            const excepcionExtra = await this.prisma.relEmpleadosDidsExcepciones.findFirst({
                where: {
                    idEmpleado: idEmpleado,
                    Did: telefonoLimpio,
                    TipoExcepcion: 'EXTRA',
                    Activo: true,
                },
                select: {
                    idSite: true,
                },
            });

            if (excepcionExtra && excepcionExtra.idSite) {
                idSite = excepcionExtra.idSite;
            } else {
                // B. Si no es un número EXTRA, buscamos en el catálogo general de DIDs por sede
                const didCatalogo = await this.prisma.catSitesDids.findFirst({
                    where: {
                        Did: telefonoLimpio,
                        Activo: true,
                    },
                    select: {
                        idSite: true,
                    },
                });

                if (didCatalogo) {
                    // Validar que el empleado no tenga una regla de bloqueo activa para este DID
                    const excepcionBloqueado = await this.prisma.relEmpleadosDidsExcepciones.findFirst({
                        where: {
                            idEmpleado: idEmpleado,
                            Did: telefonoLimpio,
                            TipoExcepcion: 'BLOQUEADO',
                            Activo: true,
                        },
                    });

                    if (excepcionBloqueado) {
                        this.logger.warn(`El empleado #${numeroEmpleado} intentó marcar desde un DID bloqueado: ${telefonoLimpio}`);
                        throw new BadRequestException(`El número telefónico ${telefonoLimpio} está restringido para este colaborador.`);
                    }

                    idSite = didCatalogo.idSite;
                }
            }
        }

        return idSite;
    }

    /**
     * Ruta anterior, intacta salvo el filtro de tenant en el lookup del
     * empleado. Salvavidas temporal: ATTENDANCE_ENGINE_ENABLED=false.
     *
     * TODO(artemis): borrar este método y la bandera cuando el motor lleve
     * dos semanas estable en producción.
     */
    private async clockInLegacy(dto: ArtemisClockInDto) {
        const idExternoBigInt = BigInt(dto.IdAsistencia);

        // 1. Idempotencia exacta: validar si este ID de Artemis ya fue recibido
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
        const idTenant = await resolverTenantUnico(this.prisma);
        const numeroEmpleado = dto.ExternalUserId.trim();
        const empleado = await this.prisma.empleados.findFirst({
            where: {
                numeroEmpleado,
                activo: true,
                idTenant,
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

        // 4. Fechas y sanitización
        let fechaRaw = (dto.FechaChecada || '').trim();
        if (!fechaRaw.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(fechaRaw)) {
            if (fechaRaw.includes('.')) {
                const [fechaParte, decimales] = fechaRaw.split('.');
                fechaRaw = `${fechaParte}.${decimales.slice(0, 3)}Z`;
            } else {
                fechaRaw = `${fechaRaw}Z`;
            }
        }

        const fechaChecadaDate = new Date(fechaRaw);
        if (isNaN(fechaChecadaDate.getTime())) {
            throw new BadRequestException('FechaChecada inválida');
        }

        // =========================================================================
        // 5. VALIDACIÓN ANTI-DUPLICIDAD / VENTANA DE GRACIA (COOLDOWN)
        // =========================================================================
        // Buscamos el último registro que se le procesó a este empleado
        const ultimoRegistro = await this.prisma.registrosAsistencia.findFirst({
            where: {
                idEmpleado: empleado.idEmpleado,
                estatusProcesamiento: 'PROCESADO',
            },
            orderBy: {
                fechaHoraRegistro: 'desc',
            },
            select: {
                idRegistro: true,
                fechaHoraRegistro: true,
                tipo: true,
                idJornada: true,
            },
        });

        if (ultimoRegistro && ultimoRegistro.fechaHoraRegistro) {
            const diffSegundos = Math.abs(
                Math.floor((fechaChecadaDate.getTime() - new Date(ultimoRegistro.fechaHoraRegistro).getTime()) / 1000)
            );

            if (diffSegundos < VENTANA_DUPLICADO_SEGUNDOS) {
                this.logger.warn(
                    `Checada ignorada por ventana de gracia (${diffSegundos}s < ${VENTANA_DUPLICADO_SEGUNDOS}s). Empleado: #${numeroEmpleado}`
                );

                // Respondemos exitoso para que Artemis no reintente, pero sin alterar la jornada
                return {
                    success: true,
                    duplicado: true,
                    ignoradoPorTolerancia: true,
                    message: `Marcaje ignorado por proximidad temporal (${diffSegundos}s respecto al anterior).`,
                    idRegistro: Number(ultimoRegistro.idRegistro),
                    tipo: ultimoRegistro.tipo,
                    empleado: `${empleado.nombre} ${empleado.primerApellido}`,
                    fechaHora: fechaChecadaDate,
                };
            }
        }

        const idSite = await this.resolverSitio(dto, empleado.idEmpleado, numeroEmpleado);

        // 6. Jornada diaria y asignación Entrada/Salida
        const fechaSoloStr = fechaChecadaDate.toISOString().split('T')[0];
        const fechaJornada = new Date(fechaSoloStr);
        const diaSemanaNombre = DIAS_MAP[fechaChecadaDate.getUTCDay()];

        return await this.prisma.$transaction(async (tx: any) => {
            const horarioDia = await tx.horariosEmpleado.findFirst({
                where: {
                    idEmpleado: empleado.idEmpleado,
                    DiaSemana: diaSemanaNombre,
                },
            });

            let jornada = await tx.jornadasEmpleado.findFirst({
                where: {
                    idEmpleado: empleado.idEmpleado,
                    fecha: fechaJornada,
                },
            });

            let tipoChecada: 'ENTRADA' | 'SALIDA' = 'ENTRADA';

            if (!jornada) {
                tipoChecada = 'ENTRADA';
                let minutosRetardo = 0;
                let horaEntradaTeorica: Date | null = null;
                let horaSalidaTeorica: Date | null = null;

                if (horarioDia) {
                    horaEntradaTeorica = horarioDia.HoraEntrada;
                    horaSalidaTeorica = horarioDia.HoraSalida;

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

            const nuevoRegistro = await tx.registrosAsistencia.create({
                data: {
                    idTenant: empleado.idTenant,
                    idEmpresa: empleado.idEmpresa,
                    idEmpleado: empleado.idEmpleado,
                    idJornada: jornada.idJornada,
                    idSitioDetectado: idSite,
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

    // Sincroniza los dispositivos de Artemis a la base de datos de Talent Core
    async syncDevices(dispositivos: ArtemisDeviceItemDto[], idTenant: number = 0) {
        if (!dispositivos || dispositivos.length === 0) {
            throw new BadRequestException('No se proporcionaron dispositivos para procesar.');
        }

        this.logger.log(`Iniciando sincronización de ${dispositivos.length} dispositivos para el tenant ${idTenant}...`);

        const resultados = await this.prisma.$transaction(async (tx: any) => {
            const operaciones = dispositivos.map((disp) => {
                // Normalizar mayúsculas por si mandan 'Biometrico' en lugar de 'BIOMETRICO'
                const tipoNormalizado = disp.tipo.toUpperCase() as TipoDispositivoEnum;

                return tx.catDispositivos.upsert({
                    where: {
                        UQ_Dispositivo_Tenant_Artemis: {
                            idTenant: idTenant,
                            idDispositivoArtemis: disp.idDispositivo,
                        },
                    },
                    update: {
                        tipo: tipoNormalizado,
                        alias: disp.alias.trim(),
                        modelo: disp.modelo?.trim() ?? null,
                        Activo: true,
                    },
                    create: {
                        idTenant: idTenant,
                        idDispositivoArtemis: disp.idDispositivo,
                        tipo: tipoNormalizado,
                        alias: disp.alias.trim(),
                        modelo: disp.modelo?.trim() ?? null,
                        Activo: true,
                        UsuarioRegistro: 'artemis_sync',
                    },
                });
            });

            return Promise.all(operaciones);
        });

        this.logger.log(`Sincronización completada exitosamente. Total procesados: ${resultados.length}`);

        return {
            success: true,
            message: `Dispositivos sincronizados exitosamente. Total: ${resultados.length}`,
            totalSincronizados: resultados.length,
        };
    }
}
