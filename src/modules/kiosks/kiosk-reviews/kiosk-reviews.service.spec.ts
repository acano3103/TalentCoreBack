jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { MediaPathService } from 'src/common/services/media-path.service';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import { DEFAULT_ATTENDANCE_CONFIG } from 'src/modules/config/attendance-config/interfaces/attendance-config.interface';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../../auth/dto/active-user.dto';
import { SesionKiosco } from '../kiosk-auth/kiosco-actual';
import { KioskDeviceService } from '../kiosk-device/kiosk-device.service';
import { KioskReviewsService } from './kiosk-reviews.service';

const user: ActiveUserDto = {
    id: 7,
    uuid: 'user-uuid',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
};

const sesion: SesionKiosco = {
    tipo: 'KIOSCO',
    idKiosco: 5,
    idTenant: 3,
    idEmpresa: 9,
    codigo: 'KSK-A82F91C4',
    nombre: 'Recepción',
    modalidad: 'FIJO',
    jti: 'jti-1',
};

function enMexico(anio: number, mes: number, dia: number, hora: number, minuto: number): Date {
    return new Date(Date.UTC(anio, mes - 1, dia, hora + 6, minuto, 0));
}

function horaReloj(hora: number, minuto = 0): Date {
    return new Date(Date.UTC(1970, 0, 1, hora, minuto, 0));
}

function mismo(a: unknown, b: unknown): boolean {
    if (typeof a === 'bigint' || typeof b === 'bigint') {
        return BigInt(a as bigint) === BigInt(b as bigint);
    }
    return a === b;
}

function crearMemoria() {
    const empleados: any[] = [];
    const registros: any[] = [];
    const jornadas: any[] = [];
    const incidencias: any[] = [];
    const revisiones: any[] = [];
    const evidencias: any[] = [];
    const relaciones: any[] = [];
    const sites: any[] = [];
    const kioscos: any[] = [];
    const kioscoSites: any[] = [];
    let seqRegistro = 1n;
    let seqJornada = 1;
    let seqRevision = 1n;
    let seqRelacion = 1;
    const horario = {
        idEmpleado: 10,
        DiaSemana: 'Miércoles',
        HoraEntrada: horaReloj(8),
        HoraSalida: horaReloj(17),
    };

    const ordenar = (filas: any[], orderBy?: any) => {
        const criterios = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        if (criterios.length === 0) return [...filas];
        return [...filas].sort((a, b) => {
            for (const criterio of criterios) {
                const campo = Object.keys(criterio)[0];
                const dir = criterio[campo] === 'desc' ? -1 : 1;
                const valor = (item: any) => {
                    const actual = item[campo];
                    if (actual instanceof Date) return actual.getTime();
                    if (typeof actual === 'bigint') return Number(actual);
                    return actual ?? 0;
                };
                if (valor(a) < valor(b)) return -1 * dir;
                if (valor(a) > valor(b)) return 1 * dir;
            }
            return 0;
        });
    };

    const clavesRegistro = new Set([
        'idRegistro', 'idTenant', 'idEmpresa', 'idEmpleado', 'idKiosco', 'idSitioDetectado',
        'canal', 'tipo', 'requiereRevision', 'estatusProcesamiento', 'fechaHoraRegistro',
        'banderasRevision', 'uuidCliente', 'idJornada', 'JornadasEmpleado', 'idExternoArtemis',
    ]);

    const pasaRegistro = (registro: any, where: any = {}) => {
        for (const clave of Object.keys(where)) {
            if (!clavesRegistro.has(clave)) {
                throw new Error(`Filtro de registro no soportado: ${clave}`);
            }
        }
        if (where.idRegistro != null && !mismo(registro.idRegistro, where.idRegistro)) return false;
        if (where.idTenant != null && registro.idTenant !== where.idTenant) return false;
        if (where.idEmpresa != null && registro.idEmpresa !== where.idEmpresa) return false;
        if (where.idEmpleado != null && registro.idEmpleado !== where.idEmpleado) return false;
        if (where.idKiosco != null && registro.idKiosco !== where.idKiosco) return false;
        if (where.idSitioDetectado != null && registro.idSitioDetectado !== where.idSitioDetectado) return false;
        if (where.idJornada != null && registro.idJornada !== where.idJornada) return false;
        if (where.uuidCliente != null && registro.uuidCliente !== where.uuidCliente) return false;
        if (where.tipo != null && registro.tipo !== where.tipo) return false;
        if (where.requiereRevision != null && registro.requiereRevision !== where.requiereRevision) return false;
        if (typeof where.canal === 'string' && registro.canal !== where.canal) return false;
        if (where.canal?.not != null && registro.canal === where.canal.not) return false;
        if (typeof where.estatusProcesamiento === 'string' && registro.estatusProcesamiento !== where.estatusProcesamiento) {
            return false;
        }
        if (where.estatusProcesamiento?.not != null && registro.estatusProcesamiento === where.estatusProcesamiento.not) {
            return false;
        }
        if (where.fechaHoraRegistro?.gte && registro.fechaHoraRegistro < where.fechaHoraRegistro.gte) return false;
        if (where.fechaHoraRegistro?.lte && registro.fechaHoraRegistro > where.fechaHoraRegistro.lte) return false;
        if (where.banderasRevision?.array_contains) {
            const banderas = registro.banderasRevision;
            if (!Array.isArray(banderas) || !banderas.includes(where.banderasRevision.array_contains)) return false;
        }
        if (where.JornadasEmpleado?.fecha) {
            const jornada = jornadas.find((item) => item.idJornada === registro.idJornada);
            if (!jornada || jornada.fecha.getTime() !== where.JornadasEmpleado.fecha.getTime()) return false;
        }
        return true;
    };

    const pasaIncidencia = (fila: any, where: any = {}) => {
        if (where.idPorIdentificar != null && !mismo(fila.idPorIdentificar, where.idPorIdentificar)) return false;
        if (where.idTenant != null && fila.idTenant !== where.idTenant) return false;
        if (where.idEmpresa != null && fila.idEmpresa !== where.idEmpresa) return false;
        if (where.idKiosco != null && fila.idKiosco !== where.idKiosco) return false;
        if (where.idSite != null && fila.idSite !== where.idSite) return false;
        if (where.estatus != null && fila.estatus !== where.estatus) return false;
        if (where.tipoIncidencia != null && fila.tipoIncidencia !== where.tipoIncidencia) return false;
        if (where.uuidCliente != null && fila.uuidCliente !== where.uuidCliente) return false;
        if (where.fechaHoraRegistro?.gte && fila.fechaHoraRegistro < where.fechaHoraRegistro.gte) return false;
        if (where.fechaHoraRegistro?.lte && fila.fechaHoraRegistro > where.fechaHoraRegistro.lte) return false;
        return true;
    };

    const pasaEmpleado = (fila: any, where: any = {}) => {
        if (typeof where.idEmpleado === 'number' && fila.idEmpleado !== where.idEmpleado) return false;
        if (where.idEmpleado?.in && !where.idEmpleado.in.includes(fila.idEmpleado)) return false;
        if (where.idTenant != null && fila.idTenant !== where.idTenant) return false;
        if (where.idEmpresa != null && fila.idEmpresa !== where.idEmpresa) return false;
        if (where.idUsuario != null && fila.idUsuario !== where.idUsuario) return false;
        if (where.activo != null && fila.activo !== where.activo) return false;
        if (where.idSite?.in && !where.idSite.in.includes(fila.idSite)) return false;
        if (typeof where.idSite === 'number' && fila.idSite !== where.idSite) return false;
        return true;
    };

    const adornarRegistro = (fila: any, include?: any) => {
        if (!include) return fila;
        return {
            ...fila,
            ...(include.Empleados
                ? { Empleados: empleados.find((item) => item.idEmpleado === fila.idEmpleado) ?? null }
                : {}),
            ...(include.KioscosAsistencia
                ? { KioscosAsistencia: kioscos.find((item) => item.idKiosco === fila.idKiosco) ?? null }
                : {}),
        };
    };

    const adornarIncidencia = (fila: any, include?: any) => {
        if (!include) return fila;
        const candidato = empleados.find((item) => item.idEmpleado === fila.idEmpleadoCandidato) ?? null;
        return {
            ...fila,
            Empleados_RegistrosKioscoPorIdentificar_idEmpleadoCandidatoToEmpleados: candidato,
            KioscosAsistencia: kioscos.find((item) => item.idKiosco === fila.idKiosco) ?? null,
            AsistenciaEvidencias: evidencias.find((item) => item.idEvidencia === fila.idEvidencia) ?? null,
            CatSites: sites.find((item) => item.idSite === fila.idSite) ?? null,
        };
    };

    const aplicar = (fila: any, data: Record<string, unknown>) => {
        for (const [clave, valor] of Object.entries(data)) {
            if (valor !== undefined) fila[clave] = valor;
        }
        return fila;
    };

    const prisma = {
        empleados: {
            findUnique: jest.fn(async ({ where }: any) =>
                empleados.find((fila) => fila.idEmpleado === where.idEmpleado) ?? null),
            findFirst: jest.fn(async ({ where }: any) => empleados.find((fila) => pasaEmpleado(fila, where)) ?? null),
            findMany: jest.fn(async ({ where }: any) => empleados.filter((fila) => pasaEmpleado(fila, where))),
        },
        registrosAsistencia: {
            findUnique: jest.fn(async ({ where }: any) => registros.find((fila) => pasaRegistro(fila, where)) ?? null),
            findFirst: jest.fn(async ({ where, orderBy }: any) => ordenar(registros.filter((fila) => pasaRegistro(fila, where)), orderBy)[0] ?? null),
            findMany: jest.fn(async ({ where, orderBy, skip, take, include }: any) => {
                let filas = ordenar(registros.filter((fila) => pasaRegistro(fila, where)), orderBy);
                if (skip) filas = filas.slice(skip);
                if (take != null) filas = filas.slice(0, take);
                return filas.map((fila) => adornarRegistro(fila, include));
            }),
            count: jest.fn(async ({ where }: any) => registros.filter((fila) => pasaRegistro(fila, where)).length),
            create: jest.fn(async ({ data }: any) => {
                const registro = { idRegistro: seqRegistro++, requiereRevision: false, estatusProcesamiento: 'PROCESADO', ...data };
                registros.push(registro);
                return registro;
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const registro = registros.find((fila) => mismo(fila.idRegistro, where.idRegistro));
                if (!registro) throw new Error('registro no encontrado');
                return aplicar(registro, data);
            }),
            updateMany: jest.fn(async ({ where, data }: any) => {
                const filas = registros.filter((fila) => pasaRegistro(fila, where));
                filas.forEach((fila) => aplicar(fila, data));
                return { count: filas.length };
            }),
        },
        jornadasEmpleado: {
            findUnique: jest.fn(async ({ where }: any) => {
                if (where.idJornada != null) return jornadas.find((fila) => fila.idJornada === where.idJornada) ?? null;
                if (where.idEmpleado_fecha) {
                    const { idEmpleado, fecha } = where.idEmpleado_fecha;
                    return jornadas.find((fila) => fila.idEmpleado === idEmpleado && fila.fecha.getTime() === fecha.getTime()) ?? null;
                }
                return null;
            }),
            upsert: jest.fn(async ({ where, create, update }: any) => {
                const { idEmpleado, fecha } = where.idEmpleado_fecha;
                let jornada = jornadas.find((fila) => fila.idEmpleado === idEmpleado && fila.fecha.getTime() === fecha.getTime());
                if (!jornada) {
                    jornada = {
                        idJornada: seqJornada++,
                        minutosTrabajados: 0,
                        minutosRetardo: 0,
                        minutosComida: 0,
                        minutosComidaExcedidos: 0,
                        minutosExtraDobles: 0,
                        minutosExtraTriples: 0,
                        horaEntradaReal: null,
                        horaSalidaReal: null,
                        horaInicioComidaReal: null,
                        horaFinComidaReal: null,
                        revisada: false,
                        estatusJornada: 'ABIERTA',
                        ...create,
                    };
                    jornadas.push(jornada);
                } else {
                    aplicar(jornada, update);
                }
                return jornada;
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const jornada = jornadas.find((fila) => fila.idJornada === where.idJornada);
                if (!jornada) throw new Error('jornada no encontrada');
                return aplicar(jornada, data);
            }),
        },
        registrosKioscoPorIdentificar: {
            findFirst: jest.fn(async ({ where }: any) => incidencias.find((fila) => pasaIncidencia(fila, where)) ?? null),
            findMany: jest.fn(async ({ where, orderBy, skip, take, include }: any) => {
                let filas = ordenar(incidencias.filter((fila) => pasaIncidencia(fila, where)), orderBy);
                if (skip) filas = filas.slice(skip);
                if (take != null) filas = filas.slice(0, take);
                return filas.map((fila) => adornarIncidencia(fila, include));
            }),
            count: jest.fn(async ({ where }: any) => incidencias.filter((fila) => pasaIncidencia(fila, where)).length),
            updateMany: jest.fn(async ({ where, data }: any) => {
                const filas = incidencias.filter((fila) => pasaIncidencia(fila, where));
                filas.forEach((fila) => aplicar(fila, data));
                return { count: filas.length };
            }),
            groupBy: jest.fn(async ({ where }: any) => {
                const totales = new Map<string, number>();
                for (const fila of incidencias.filter((item) => pasaIncidencia(item, where))) {
                    totales.set(fila.tipoIncidencia, (totales.get(fila.tipoIncidencia) ?? 0) + 1);
                }
                return [...totales.entries()].map(([tipoIncidencia, total]) => ({
                    tipoIncidencia,
                    _count: { idPorIdentificar: total },
                }));
            }),
        },
        revisionesRegistroAsistencia: {
            create: jest.fn(async ({ data }: any) => {
                const revision = { idRevision: seqRevision++, ...data };
                revisiones.push(revision);
                return revision;
            }),
        },
        relEmpleadosSites: {
            findFirst: jest.fn(async ({ where }: any) => {
                return relaciones.find((fila) => {
                    if (where.idEmpleado != null && fila.idEmpleado !== where.idEmpleado) return false;
                    if (where.idSite != null && fila.idSite !== where.idSite) return false;
                    if (where.Activo != null && fila.Activo !== where.Activo) return false;
                    if (where.EsPrincipal != null && fila.EsPrincipal !== where.EsPrincipal) return false;
                    return true;
                }) ?? null;
            }),
            findMany: jest.fn(async ({ where }: any) => relaciones.filter((fila) => {
                if (where.Activo != null && fila.Activo !== where.Activo) return false;
                if (where.idSite?.in && !where.idSite.in.includes(fila.idSite)) return false;
                if (where.MetodoAsistencia) return false;
                return true;
            })),
            create: jest.fn(async ({ data }: any) => {
                const relacion = { idEmpleadoSite: seqRelacion++, ...data };
                relaciones.push(relacion);
                return relacion;
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const relacion = relaciones.find((fila) => fila.idEmpleadoSite === where.idEmpleadoSite);
                if (!relacion) throw new Error('relación no encontrada');
                return aplicar(relacion, data);
            }),
        },
        catSites: {
            findUnique: jest.fn(async ({ where }: any) => sites.find((fila) => fila.idSite === where.idSite) ?? null),
            findFirst: jest.fn(async ({ where }: any) => sites.find((fila) => {
                if (where.idSite != null && fila.idSite !== where.idSite) return false;
                if (where.idTenant != null && fila.idTenant !== where.idTenant) return false;
                if (where.idEmpresa != null && fila.idEmpresa !== where.idEmpresa) return false;
                return true;
            }) ?? null),
            findMany: jest.fn(async ({ where }: any) => sites.filter((fila) => !where?.idSite?.in || where.idSite.in.includes(fila.idSite))),
        },
        kioscoSites: {
            findMany: jest.fn(async ({ where }: any) => kioscoSites.filter((fila) => fila.idKiosco === where.idKiosco)),
        },
        asistenciaEvidencias: {
            findUnique: jest.fn(async ({ where }: any) => evidencias.find((fila) => fila.idEvidencia === where.idEvidencia) ?? null),
            findMany: jest.fn(async ({ where }: any) => evidencias.filter((fila) => !where?.idEvidencia?.in || where.idEvidencia.in.includes(fila.idEvidencia))),
            update: jest.fn(async ({ where, data }: any) => {
                const evidencia = evidencias.find((fila) => fila.idEvidencia === where.idEvidencia);
                if (!evidencia) throw new Error('evidencia no encontrada');
                return aplicar(evidencia, data);
            }),
        },
        configuracionJornadaLegal: {
            findFirst: jest.fn(async () => null),
        },
        horariosEmpleado: {
            findFirst: jest.fn(async ({ where }: any) => {
                if (where.idEmpleado !== horario.idEmpleado) return null;
                if (where.DiaSemana !== horario.DiaSemana) return null;
                return horario;
            }),
        },
        $transaction: jest.fn(async (arg: any) => {
            if (typeof arg === 'function') return arg(prisma);
            if (Array.isArray(arg)) return Promise.all(arg);
            return arg;
        }),
    };

    return {
        prisma, empleados, registros, jornadas, incidencias, revisiones, evidencias, relaciones, sites, kioscos, kioscoSites,
    };
}

function baseEmpresa() {
    return { idTenant: 3, idEmpresa: 9 };
}

describe('KioskReviewsService', () => {
    let memoria: ReturnType<typeof crearMemoria>;
    let service: KioskReviewsService;
    let device: KioskDeviceService;
    let engine: AttendanceEngineService;

    const baseMedios = process.env.MEDIA_PUBLIC_URL_BASE;

    beforeEach(() => {
        delete process.env.MEDIA_PUBLIC_URL_BASE;
        memoria = crearMemoria();
        memoria.sites.push(
            { idSite: 10, idTenant: 3, idEmpresa: 9, zonaHoraria: 'America/Mexico_City', Descripcion: 'Planta' },
            { idSite: 99, idTenant: 3, idEmpresa: 9, zonaHoraria: 'America/Mexico_City', Descripcion: 'Otra' },
        );
        memoria.kioscos.push({ idKiosco: 5, codigo: 'KSK-A82F91C4', nombre: 'Recepción' });
        memoria.kioscoSites.push({ idKiosco: 5, idSite: 10 });
        memoria.empleados.push(
            { idEmpleado: 10, ...baseEmpresa(), idSite: 10, numeroEmpleado: '100', nombre: 'Ana', primerApellido: 'Ruiz', activo: true },
            { idEmpleado: 20, ...baseEmpresa(), idSite: 10, numeroEmpleado: '200', nombre: 'Luis', primerApellido: 'Paz', activo: true },
            { idEmpleado: 30, ...baseEmpresa(), idSite: 99, numeroEmpleado: '300', nombre: 'Nora', primerApellido: 'Díaz', activo: true },
            { idEmpleado: 31, ...baseEmpresa(), idSite: 99, numeroEmpleado: '310', nombre: 'Omar', primerApellido: 'León', activo: true },
            { idEmpleado: 40, ...baseEmpresa(), idSite: 99, numeroEmpleado: '400', nombre: 'Iris', primerApellido: 'Sol', activo: true },
        );
        memoria.evidencias.push({
            idEvidencia: 21,
            idEmpresa: 9,
            idKiosco: 5,
            idEmpleado: null,
            consumida: true,
            rostroDetectado: true,
            rutaArchivo: 'media/attendance/kiosk/9/2026/11/foto.jpg',
        });

        const config = { getConfiguracionAsistencia: jest.fn(async () => DEFAULT_ATTENDANCE_CONFIG) };
        engine = new AttendanceEngineService(
            memoria.prisma as unknown as PrismaService,
            config as unknown as AttendanceTrackingConfigService,
        );
        device = new KioskDeviceService(
            memoria.prisma as unknown as PrismaService,
            config as unknown as AttendanceTrackingConfigService,
            engine,
            { get: jest.fn(() => undefined) } as unknown as ConfigService,
            { saveFile: jest.fn(), deleteFile: jest.fn() } as unknown as MediaPathService,
        );
        service = new KioskReviewsService(
            memoria.prisma as unknown as PrismaService,
            engine,
            device,
        );
    });

    afterAll(() => {
        if (baseMedios === undefined) delete process.env.MEDIA_PUBLIC_URL_BASE;
        else process.env.MEDIA_PUBLIC_URL_BASE = baseMedios;
    });

    function sembrarRegistro(parcial: Record<string, unknown> = {}): any {
        const registro = {
            idRegistro: 100n + BigInt(memoria.registros.length),
            ...baseEmpresa(),
            idEmpleado: 10,
            idKiosco: 5,
            idSitioDetectado: 10,
            canal: 'KIOSCO',
            tipo: 'ENTRADA',
            fechaHoraRegistro: enMexico(2026, 11, 11, 8, 10),
            requiereRevision: true,
            banderasRevision: ['SIN_ROSTRO'],
            estatusProcesamiento: 'PROCESADO',
            idEvidencia: 21,
            numeroEmpleadoCapturado: '100',
            idJornada: null,
            ...parcial,
        };
        memoria.registros.push(registro);
        return registro;
    }

    function sembrarIncidencia(parcial: Record<string, unknown> = {}): any {
        const incidencia = {
            idPorIdentificar: 50n + BigInt(memoria.incidencias.length),
            ...baseEmpresa(),
            idKiosco: 5,
            idSite: 10,
            idEmpleadoCandidato: 30,
            numeroCapturado: '300',
            tipo: 'ENTRADA',
            tipoIncidencia: 'EMPLEADO_NO_ASIGNADO',
            fechaHoraRegistro: enMexico(2026, 11, 11, 8, 10),
            idEvidencia: null,
            uuidCliente: `inc-${memoria.incidencias.length + 1}`,
            metodoIdentificacion: 'NUMERO',
            esOffline: false,
            desfaseRelojSegundos: null,
            estatus: 'PENDIENTE',
            latitud: null,
            longitud: null,
            ...parcial,
        };
        memoria.incidencias.push(incidencia);
        return incidencia;
    }

    const rango = { from: '2026-11-11', to: '2026-11-11' };

    it('lista el SIN_ROSTRO, lo quita al validarlo y los conteos cuadran con la lista', async () => {
        sembrarRegistro();
        sembrarRegistro({
            fechaHoraRegistro: enMexico(2026, 11, 1, 8, 0),
            banderasRevision: ['OFFLINE'],
        });
        sembrarIncidencia({ tipoIncidencia: 'EMPLEADO_NO_ASIGNADO', uuidCliente: 'inc-asignado' });
        sembrarIncidencia({
            tipoIncidencia: 'EMPLEADO_INACTIVO',
            idEmpleadoCandidato: 30,
            uuidCliente: 'inc-inactivo',
        });
        sembrarIncidencia({
            tipoIncidencia: 'EMPLEADO_NO_ENCONTRADO',
            idEmpleadoCandidato: null,
            numeroCapturado: '999',
            uuidCliente: 'inc-no',
        });
        sembrarIncidencia({
            tipoIncidencia: 'EMPLEADO_NO_ASIGNADO',
            fechaHoraRegistro: enMexico(2026, 11, 1, 9, 0),
            uuidCliente: 'inc-vieja',
            estatus: 'PENDIENTE',
        });
        sembrarIncidencia({ estatus: 'APROBADA', uuidCliente: 'inc-resuelta' });

        const lista = await service.list(user, 9, { fuente: 'registros' as any, ...rango, page: 1, limit: 10 });
        const conteos = await service.counts(user, 9, rango);
        const soloRostro = await service.list(user, 9, {
            fuente: 'registros' as any,
            ...rango,
            bandera: 'SIN_ROSTRO',
            page: 1,
            limit: 10,
        });
        const incidencias = await service.list(user, 9, { fuente: 'incidencias' as any, ...rango, page: 1, limit: 10 });
        const noAsignados = await service.list(user, 9, {
            fuente: 'incidencias' as any,
            ...rango,
            tipoIncidencia: 'EMPLEADO_NO_ASIGNADO' as any,
            page: 1,
            limit: 10,
        });

        expect(lista.pagination.total).toBe(conteos.registros);
        expect(lista.items).toHaveLength(1);
        expect(lista.items[0]).toEqual(expect.objectContaining({
            fuente: 'registros',
            banderas: ['SIN_ROSTRO'],
            tipoIncidencia: null,
            fechaHoraRegistro: '2026-11-11T08:10:00-06:00',
            rutaEvidencia: 'media/attendance/kiosk/9/2026/11/foto.jpg',
            urlEvidencia: '/api/proxy-v2/media/attendance/kiosk/9/2026/11/foto.jpg',
            kiosco: { codigo: 'KSK-A82F91C4', nombre: 'Recepción' },
        }));
        expect(lista.items[0].empleado).toEqual(expect.objectContaining({
            idEmpleado: 10,
            numeroEmpleado: '100',
            nombreCorto: 'Ana Ruiz',
        }));
        expect(soloRostro.pagination.total).toBe(1);
        expect(incidencias.pagination.total).toBe(3);
        expect(noAsignados.pagination.total).toBe(conteos.incidencias.EMPLEADO_NO_ASIGNADO);
        expect(conteos.incidencias).toEqual({
            EMPLEADO_NO_ENCONTRADO: 1,
            EMPLEADO_INACTIVO: 1,
            EMPLEADO_NO_ASIGNADO: 1,
        });

        await service.validate(user, 9, lista.items[0].id, {});
        const despues = await service.list(user, 9, { fuente: 'registros' as any, ...rango, page: 1, limit: 10 });
        expect(despues.items).toHaveLength(0);
        expect(memoria.revisiones).toHaveLength(1);
        expect(memoria.revisiones[0]).toEqual(expect.objectContaining({
            accion: 'VALIDAR',
            banderas: ['SIN_ROSTRO'],
            idEmpleadoRevisor: null,
        }));
        expect(memoria.revisiones[0].datosNuevos).toEqual({ usuario: 'user-uuid' });
    });

    it('rechaza el registro, anula la checada y vacía la jornada', async () => {
        const creada = await engine.registerCheck({
            idTenant: 3,
            idEmpresa: 9,
            idEmpleado: 10,
            canal: 'KIOSCO',
            tipo: 'ENTRADA',
            modoInferencia: 'EXPLICITO',
            fechaHoraRegistro: enMexico(2026, 11, 11, 8, 10),
            uuidCliente: 'rechazo-1',
            idKiosco: 5,
            idSitioKiosco: 10,
        });
        const registro = memoria.registros[0];
        registro.requiereRevision = true;
        registro.banderasRevision = ['SIN_ROSTRO'];
        expect(memoria.jornadas[0].horaEntradaReal).toEqual(enMexico(2026, 11, 11, 8, 10));

        await service.reject(user, 9, creada.idRegistro, { motivo: 'Checó la persona equivocada' });

        expect(registro.estatusProcesamiento).toBe('ANULADO');
        expect(registro.requiereRevision).toBe(false);
        expect(registro.idEmpleado).toBe(10);
        expect(memoria.jornadas[0].horaEntradaReal).toBeNull();
        expect(memoria.jornadas[0].minutosTrabajados).toBe(0);
        expect(memoria.revisiones[0]).toEqual(expect.objectContaining({
            accion: 'RECHAZAR',
            banderas: ['SIN_ROSTRO'],
            motivo: 'Checó la persona equivocada',
        }));
    });

    it('reasigna sin cambiar el empleado del original y recalcula las dos jornadas', async () => {
        const creada = await engine.registerCheck({
            idTenant: 3,
            idEmpresa: 9,
            idEmpleado: 10,
            canal: 'KIOSCO',
            tipo: 'ENTRADA',
            modoInferencia: 'EXPLICITO',
            fechaHoraRegistro: enMexico(2026, 11, 11, 8, 5),
            uuidCliente: 'reasigna-1',
            idKiosco: 5,
            idSitioKiosco: 10,
            idEvidencia: null,
        });
        memoria.registros[0].requiereRevision = true;
        memoria.registros[0].banderasRevision = ['DOBLE_CANAL'];

        const resultado = await service.reassign(user, 9, creada.idRegistro, {
            idEmpleado: 20,
            motivo: 'Era de Luis',
        });

        const origen = memoria.registros.find((fila) => fila.idRegistro.toString() === creada.idRegistro);
        const copia = memoria.registros.find((fila) => fila.idRegistro.toString() === resultado.idRegistroNuevo);
        const jornadaOrigen = memoria.jornadas.find((fila) => fila.idEmpleado === 10);
        const jornadaNueva = memoria.jornadas.find((fila) => fila.idEmpleado === 20);

        expect(origen.estatusProcesamiento).toBe('ANULADO');
        expect(origen.idEmpleado).toBe(10);
        expect(origen.requiereRevision).toBe(false);
        expect(copia.idEmpleado).toBe(20);
        expect(copia.idRegistroOrigen).toEqual(origen.idRegistro);
        expect(copia.idKiosco).toBe(5);
        expect(copia.fechaHoraRegistro).toEqual(enMexico(2026, 11, 11, 8, 5));
        expect(jornadaOrigen.horaEntradaReal).toBeNull();
        expect(jornadaNueva.horaEntradaReal).toEqual(enMexico(2026, 11, 11, 8, 5));
        expect(memoria.revisiones[0]).toEqual(expect.objectContaining({
            accion: 'REASIGNAR',
            idEmpleadoNuevo: 20,
            motivo: 'Era de Luis',
        }));
        expect(memoria.revisiones[0].datosAnteriores.idEmpleado).toBe(10);
        expect(memoria.revisiones[0].datosNuevos.idRegistro).toBe(resultado.idRegistroNuevo);
    });

    it('no vuelve a resolver un registro ya validado', async () => {
        const registro = sembrarRegistro();
        await service.validate(user, 9, registro.idRegistro.toString(), { motivo: 'Se ve bien' });

        const error = await service.validate(user, 9, registro.idRegistro.toString(), {}).catch((falla) => falla);

        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(409);
        expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'YA_RESUELTO' }));
        expect(memoria.revisiones).toHaveLength(1);
    });

    it('valida en lote y reporta el que ya estaba resuelto', async () => {
        const pendiente = sembrarRegistro();
        const resuelto = sembrarRegistro({ requiereRevision: false, banderasRevision: ['OFFLINE'] });

        const resultado = await service.bulkValidate(user, 9, [
            pendiente.idRegistro.toString(),
            resuelto.idRegistro.toString(),
        ]);

        expect(resultado.resultados).toEqual([
            { idRegistro: pendiente.idRegistro.toString(), ok: true },
            expect.objectContaining({
                idRegistro: resuelto.idRegistro.toString(),
                ok: false,
                codigo: 'YA_RESUELTO',
            }),
        ]);
    });

    it('guarda al revisor cuando el usuario tiene empleado ligado', async () => {
        memoria.empleados.push({
            idEmpleado: 7,
            ...baseEmpresa(),
            idSite: 10,
            idUsuario: 'user-uuid',
            numeroEmpleado: '007',
            nombre: 'Ana',
            primerApellido: 'López',
            activo: true,
        });
        const registro = sembrarRegistro();

        await service.validate(user, 9, registro.idRegistro.toString(), {});

        expect(memoria.revisiones[0].idEmpleadoRevisor).toBe(7);
        expect(memoria.revisiones[0].datosNuevos).not.toEqual(expect.objectContaining({ usuario: 'user-uuid' }));
    });

    it('asigna la Entrada como regreso de comida cuando la comida está abierta', async () => {
        const fecha = new Date(Date.UTC(2026, 10, 11));
        memoria.jornadas.push({
            idJornada: 50,
            idEmpleado: 30,
            idTenant: 3,
            idEmpresa: 9,
            fecha,
            estatusJornada: 'ABIERTA',
            revisada: false,
            horaEntradaTeorica: null,
            horaSalidaTeorica: null,
        });
        memoria.registros.push({
            idRegistro: 900n,
            ...baseEmpresa(),
            idEmpleado: 30,
            idKiosco: null,
            canal: 'APP_MOVIL',
            tipo: 'INICIO_COMIDA',
            estatusProcesamiento: 'PROCESADO',
            fechaHoraRegistro: enMexico(2026, 11, 11, 8, 0),
            idJornada: 50,
            requiereRevision: false,
        });
        const incidencia = sembrarIncidencia({
            tipo: 'ENTRADA',
            uuidCliente: 'comida-abierta',
            idEvidencia: null,
        });

        const resultado = await service.approve(user, 9, incidencia.idPorIdentificar.toString(), {});

        const registro = memoria.registros.find((fila) => fila.idRegistro.toString() === resultado.idRegistro);
        expect(registro.tipo).toBe('FIN_COMIDA');
        expect(registro.canal).toBe('KIOSCO');
        expect(registro.idEmpleado).toBe(30);
    });

    it('aprueba sin agregar al site y conserva hora y evidencia', async () => {
        const incidencia = sembrarIncidencia({ idEvidencia: 21, uuidCliente: 'aprobar-foto' });

        const resultado = await service.approve(user, 9, incidencia.idPorIdentificar.toString(), {});

        const registro = memoria.registros.find((fila) => fila.idRegistro.toString() === resultado.idRegistro);
        expect(incidencia.estatus).toBe('APROBADA');
        expect(incidencia.idEmpleadoAsignado).toBe(30);
        expect(incidencia.idRegistroGenerado).toEqual(registro.idRegistro);
        expect(incidencia.agregarEmpleadoSite).toBe(false);
        expect(registro.idEmpleado).toBe(30);
        expect(registro.fechaHoraRegistro).toEqual(incidencia.fechaHoraRegistro);
        expect(registro.idEvidencia).toBe(21);
        expect(registro.urlFoto).toBe('media/attendance/kiosk/9/2026/11/foto.jpg');
        expect(memoria.evidencias[0].consumida).toBe(true);
        expect(memoria.relaciones).toHaveLength(0);
        expect(memoria.revisiones[0].accion).toBe('VALIDAR');
        expect(memoria.jornadas.find((fila) => fila.idEmpleado === 30).horaEntradaReal).toEqual(incidencia.fechaHoraRegistro);
    });

    it('aprueba con agregarEmpleadoSite y el empleado entra al padrón siguiente', async () => {
        const antes = await device.roster(sesion);
        expect(antes.sinCambios).toBe(false);
        if (!antes.sinCambios) {
            expect(antes.empleados.map((fila) => fila.idEmpleado)).not.toContain(40);
        }

        const incidencia = sembrarIncidencia({
            idEmpleadoCandidato: 40,
            numeroCapturado: '400',
            uuidCliente: 'aprobar-site',
            idEvidencia: null,
        });

        await service.approve(user, 9, incidencia.idPorIdentificar.toString(), { agregarEmpleadoSite: true });

        expect(incidencia.estatus).toBe('APROBADA');
        expect(memoria.relaciones).toEqual([
            expect.objectContaining({
                idEmpleado: 40,
                idSite: 10,
                Activo: true,
                EsPrincipal: false,
            }),
        ]);
        expect(memoria.relaciones[0].MetodoAsistencia).toBeUndefined();
        expect(memoria.registros.some((fila) => fila.idEmpleado === 40 && fila.estatusProcesamiento === 'PROCESADO')).toBe(true);

        const despues = await device.roster(sesion, antes.version);
        expect(despues.sinCambios).toBe(false);
        if (!despues.sinCambios) {
            expect(despues.empleados).toEqual(expect.arrayContaining([
                expect.objectContaining({ idEmpleado: 40, numeroEmpleado: '400', nombreCorto: 'Iris Sol' }),
            ]));
        }
    });

    it('corrige la incidencia con otro empleado', async () => {
        const incidencia = sembrarIncidencia({ uuidCliente: 'corregir-1', idEvidencia: null });

        const resultado = await service.correct(user, 9, incidencia.idPorIdentificar.toString(), {
            idEmpleado: 31,
            motivo: 'Era Omar',
        });

        expect(incidencia.estatus).toBe('CORREGIDA');
        expect(incidencia.idEmpleadoAsignado).toBe(31);
        expect(resultado.idEmpleado).toBe(31);
        expect(memoria.registros.find((fila) => fila.idRegistro.toString() === resultado.idRegistro).idEmpleado).toBe(31);
        expect(memoria.revisiones[0]).toEqual(expect.objectContaining({
            accion: 'CORREGIR',
            idEmpleadoNuevo: 31,
            motivo: 'Era Omar',
        }));
    });

    it('rechaza la incidencia sin crear un registro', async () => {
        const incidencia = sembrarIncidencia({ uuidCliente: 'rechazar-inc' });

        await service.rejectIncidencia(user, 9, incidencia.idPorIdentificar.toString(), {
            motivo: 'No corresponde',
        });

        expect(incidencia.estatus).toBe('RECHAZADA');
        expect(incidencia.idRegistroGenerado).toBeUndefined();
        expect(memoria.registros).toHaveLength(0);
        expect(memoria.revisiones[0]).toEqual(expect.objectContaining({
            accion: 'RECHAZAR',
            motivo: 'No corresponde',
            idPorIdentificar: incidencia.idPorIdentificar,
        }));
    });

    it('no vuelve a resolver una incidencia ya aprobada', async () => {
        const incidencia = sembrarIncidencia({ uuidCliente: 'doble-inc', idEvidencia: null });
        await service.approve(user, 9, incidencia.idPorIdentificar.toString(), {});
        const registros = memoria.registros.length;

        const error = await service.approve(user, 9, incidencia.idPorIdentificar.toString(), {}).catch((falla) => falla);

        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(409);
        expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'YA_RESUELTO' }));
        expect(memoria.registros).toHaveLength(registros);
        expect(memoria.revisiones.filter((fila) => fila.accion === 'VALIDAR')).toHaveLength(1);
    });
});
