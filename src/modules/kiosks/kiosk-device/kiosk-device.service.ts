import { createHash } from 'crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SesionKiosco } from '../kiosk-auth/kiosco-actual';
import { errorKiosco, MENSAJE_KIOSCO_NO_ACTIVO } from '../kiosk-http';
import { politicasKioscoDe } from '../kiosk-policies.util';
import { HeartbeatKioskDto } from './dto/kiosk-device.dto';

const CACHE_PADRON_MS = 60_000;
const MENSAJE_NO_ASIGNADO = 'No estás asignado a esta ubicación.';

export interface EmpleadoPadron {
    idEmpleado: number;
    numeroEmpleado: string;
    nombreCorto: string;
    iniciales: string;
}

interface CachePadron {
    expira: number;
    version: string;
    empleados: EmpleadoPadron[];
}

const EMPLEADO_SELECT = {
    idEmpleado: true,
    numeroEmpleado: true,
    nombre: true,
    primerApellido: true,
} as const;

@Injectable()
export class KioskDeviceService {
    private readonly logger = new Logger(KioskDeviceService.name);
    private readonly cachePadron = new Map<number, CachePadron>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly attendanceConfig: AttendanceTrackingConfigService,
        private readonly engine: AttendanceEngineService,
        private readonly configService: ConfigService,
    ) {}

    async bootstrap(kiosco: SesionKiosco) {
        const fila = await this.prisma.kioscosAsistencia.findUnique({
            where: { idKiosco: kiosco.idKiosco },
            select: {
                idKiosco: true,
                idTenant: true,
                idEmpresa: true,
                codigo: true,
                nombre: true,
                modalidad: true,
                politicas: true,
                KioscoSites: {
                    orderBy: { idSite: 'asc' },
                    select: {
                        idSite: true,
                        CatSites: { select: { Descripcion: true, zonaHoraria: true } },
                    },
                },
            },
        });

        if (!fila) {
            throw errorKiosco(HttpStatus.FORBIDDEN, 'KIOSCO_NO_ACTIVO', MENSAJE_KIOSCO_NO_ACTIVO);
        }

        const [empresa, config, padron] = await Promise.all([
            this.prisma.catEmpresas.findUnique({
                where: { idEmpresa: fila.idEmpresa },
                select: { nombre_comercial: true, razon_social: true },
            }),
            this.attendanceConfig.getConfiguracionAsistencia(fila.idTenant, fila.idEmpresa),
            this.padron(kiosco),
        ]);

        return {
            kiosco: {
                idKiosco: fila.idKiosco,
                codigo: fila.codigo,
                nombre: fila.nombre,
                modalidad: fila.modalidad,
            },
            empresa: {
                idEmpresa: fila.idEmpresa,
                nombre: empresa?.nombre_comercial?.trim() || empresa?.razon_social?.trim() || '',
            },
            sites: fila.KioscoSites.map((site) => ({
                idSite: site.idSite,
                nombre: site.CatSites?.Descripcion ?? '',
                zonaHoraria: site.CatSites?.zonaHoraria ?? 'America/Mexico_City',
            })),
            politicas: politicasKioscoDe(fila.politicas),
            parametros: config.kiosco,
            versionMinimaApp: this.versionMinimaApp(),
            padronVersion: padron.version,
            servidor: { fechaHora: new Date().toISOString() },
        };
    }

    async roster(kiosco: SesionKiosco, version?: string) {
        const padron = await this.padron(kiosco);
        if (version && version === padron.version) {
            return { version: padron.version, sinCambios: true as const };
        }
        return {
            version: padron.version,
            sinCambios: false as const,
            empleados: padron.empleados,
        };
    }

    async lookup(kiosco: SesionKiosco, numero: string) {
        const buscado = numero.trim();
        const empleado = buscado
            ? await this.prisma.empleados.findFirst({
                where: { idTenant: kiosco.idTenant, numeroEmpleado: buscado },
                select: {
                    idEmpleado: true,
                    numeroEmpleado: true,
                    nombre: true,
                    primerApellido: true,
                    activo: true,
                    idSite: true,
                },
            })
            : null;

        if (!empleado) {
            throw errorKiosco(
                HttpStatus.NOT_FOUND,
                'EMPLEADO_NO_ENCONTRADO',
                'No encontramos un empleado con ese número.',
            );
        }

        if (!empleado.activo) {
            throw errorKiosco(
                HttpStatus.CONFLICT,
                'EMPLEADO_INACTIVO',
                'El empleado no está activo.',
            );
        }

        const siteIds = await this.idsSites(kiosco.idKiosco);
        if (!(await this.estaEnPadron(empleado, siteIds))) {
            throw errorKiosco(HttpStatus.CONFLICT, 'EMPLEADO_NO_ASIGNADO', MENSAJE_NO_ASIGNADO);
        }

        const ahora = new Date();
        const ctx = await this.engine.resolveContext(empleado.idEmpleado, ahora, 'KIOSCO');
        const accion = await this.engine.resolveNextType(
            empleado.idEmpleado,
            ctx.fechaJornada,
            ctx.config,
            'SECUENCIA_COMPLETA',
        );

        return {
            idEmpleado: empleado.idEmpleado,
            numeroEmpleado: empleado.numeroEmpleado,
            nombreCorto: nombreCorto(empleado.nombre, empleado.primerApellido),
            iniciales: inicialesDe(empleado.nombre, empleado.primerApellido),
            tipoSugerido: accion.sugerido,
            turnoHoy: {
                fecha: ctx.fechaLocal,
                diaSemana: ctx.diaSemana,
                zonaHoraria: ctx.zonaHoraria,
                entrada: horaDe(ctx.horario?.HoraEntrada),
                salida: horaDe(ctx.horario?.HoraSalida),
            },
        };
    }

    async heartbeat(kiosco: SesionKiosco, dto: HeartbeatKioskDto) {
        await this.prisma.kioscosAsistencia.update({
            where: { idKiosco: kiosco.idKiosco },
            data: {
                ultimoLatido: new Date(),
                pendientesReportados: dto.pendientes,
                versionApp: dto.versionApp.trim().slice(0, 20),
            },
        });

        const padron = await this.padron(kiosco);
        return {
            padronVersion: padron.version,
            versionMinimaApp: this.versionMinimaApp(),
            servidor: { fechaHora: new Date().toISOString() },
        };
    }

    private async padron(kiosco: SesionKiosco): Promise<CachePadron> {
        const ahora = Date.now();
        const cache = this.cachePadron.get(kiosco.idKiosco);
        if (cache && cache.expira > ahora) {
            return cache;
        }

        const siteIds = await this.idsSites(kiosco.idKiosco);
        const { incluidos, excluidos } = await this.cargarEmpleados(kiosco.idTenant, siteIds);
        if (excluidos > 0) {
            const etiqueta = excluidos === 1 ? 'empleado excluido' : 'empleados excluidos';
            this.logger.warn(
                `Kiosco ${kiosco.idKiosco}: ${excluidos} ${etiqueta} del padrón por no tener numeroEmpleado.`,
            );
        }

        const fresco: CachePadron = {
            expira: ahora + CACHE_PADRON_MS,
            version: versionDePadron(incluidos),
            empleados: incluidos,
        };
        this.cachePadron.set(kiosco.idKiosco, fresco);
        return fresco;
    }

    private async idsSites(idKiosco: number): Promise<number[]> {
        const filas = await this.prisma.kioscoSites.findMany({
            where: { idKiosco },
            select: { idSite: true },
        });
        return filas.map((fila) => fila.idSite);
    }

    private async cargarEmpleados(idTenant: number, siteIds: number[]) {
        if (siteIds.length === 0) {
            return { incluidos: [] as EmpleadoPadron[], excluidos: 0 };
        }

        const porSite = await this.prisma.empleados.findMany({
            where: {
                idTenant,
                activo: true,
                idSite: { in: siteIds },
            },
            select: EMPLEADO_SELECT,
        });

        const relaciones = await this.prisma.relEmpleadosSites.findMany({
            where: { Activo: true, idSite: { in: siteIds } },
            select: { idEmpleado: true },
        });

        const idsYa = new Set(porSite.map((fila) => fila.idEmpleado));
        const idsFaltantes = [...new Set(relaciones.map((fila) => fila.idEmpleado))].filter(
            (id) => !idsYa.has(id),
        );

        const porRelacion = idsFaltantes.length
            ? await this.prisma.empleados.findMany({
                where: {
                    idTenant,
                    activo: true,
                    idEmpleado: { in: idsFaltantes },
                },
                select: EMPLEADO_SELECT,
            })
            : [];

        const incluidos: EmpleadoPadron[] = [];
        let excluidos = 0;
        for (const fila of [...porSite, ...porRelacion]) {
            const numero = fila.numeroEmpleado?.trim() ?? '';
            if (!numero) {
                excluidos += 1;
                continue;
            }
            incluidos.push({
                idEmpleado: fila.idEmpleado,
                numeroEmpleado: numero,
                nombreCorto: nombreCorto(fila.nombre, fila.primerApellido),
                iniciales: inicialesDe(fila.nombre, fila.primerApellido),
            });
        }

        incluidos.sort((a, b) => a.idEmpleado - b.idEmpleado);
        return { incluidos, excluidos };
    }

    private async estaEnPadron(
        empleado: { idEmpleado: number; idSite: number | null; numeroEmpleado: string | null },
        siteIds: number[],
    ): Promise<boolean> {
        if (!empleado.numeroEmpleado?.trim() || siteIds.length === 0) {
            return false;
        }
        if (empleado.idSite != null && siteIds.includes(empleado.idSite)) {
            return true;
        }

        const relacion = await this.prisma.relEmpleadosSites.findFirst({
            where: {
                idEmpleado: empleado.idEmpleado,
                idSite: { in: siteIds },
                Activo: true,
            },
            select: { idEmpleadoSite: true },
        });
        return relacion != null;
    }

    private versionMinimaApp(): string {
        const version = this.configService.get<string>('KIOSK_MIN_APP_VERSION');
        const normalizada = typeof version === 'string' ? version.trim() : '';
        return normalizada || '0.1.0';
    }
}

function nombreCorto(nombre: string | null, apellido: string | null): string {
    return [nombre?.trim(), apellido?.trim()].filter(Boolean).join(' ');
}

function inicialesDe(nombre: string | null, apellido: string | null): string {
    const n = nombre?.trim().charAt(0) ?? '';
    const a = apellido?.trim().charAt(0) ?? '';
    return `${n}${a}`.toLocaleUpperCase('es-MX');
}

function horaDe(time: Date | null | undefined): string | null {
    if (!time) return null;
    const hh = String(time.getUTCHours()).padStart(2, '0');
    const mm = String(time.getUTCMinutes()).padStart(2, '0');
    const ss = String(time.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function versionDePadron(empleados: EmpleadoPadron[]): string {
    const canonico = empleados
        .map((empleado) =>
            [empleado.idEmpleado, empleado.numeroEmpleado, empleado.nombreCorto, empleado.iniciales].join('|'),
        )
        .join('\n');
    return createHash('sha256').update(canonico).digest('hex');
}
