jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

jest.mock('src/common/utils/file-storage.util', () => ({
    saveFileLocal: jest.fn(async () => 'media/attendance/kiosk/9/2026/11/foto.jpg'),
}));

import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { saveFileLocal } from 'src/common/utils/file-storage.util';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import { ResultadoCheck } from 'src/modules/attendance/engine/interfaces/canonical-check.interface';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SesionKiosco } from '../kiosk-auth/kiosco-actual';
import { ChecadaKioscoDto } from './dto/kiosk-device.dto';
import { KioskDeviceService } from './kiosk-device.service';

const kiosco: SesionKiosco = {
    tipo: 'KIOSCO',
    idKiosco: 5,
    idTenant: 3,
    idEmpresa: 9,
    codigo: 'KSK-A82F91C4',
    nombre: 'Recepción',
    modalidad: 'FIJO',
    jti: 'jti-1',
};

const UUID_A = '550e8400-e29b-41d4-a716-446655440000';
const UUID_B = '550e8400-e29b-41d4-a716-446655440001';
const UUID_C = '550e8400-e29b-41d4-a716-446655440002';

function checada(parcial: Partial<ChecadaKioscoDto> = {}): ChecadaKioscoDto {
    return {
        uuidCliente: UUID_A,
        metodoIdentificacion: 'NUMERO',
        numeroEmpleado: '100',
        tipo: 'ENTRADA',
        fechaHoraRegistro: '2026-11-11T14:00:00.000Z',
        idEvidencia: 15,
        esOffline: false,
        desfaseRelojSegundos: null,
        ...parcial,
    };
}

function politicas(parcial: Record<string, boolean> = {}) {
    return {
        requiereFoto: true,
        deteccionRostro: false,
        permitirOffline: true,
        aceptarNoIdentificados: false,
        ...parcial,
    };
}

function resultadoMotor(parcial: Partial<ResultadoCheck> = {}): ResultadoCheck {
    return {
        idRegistro: '77',
        idJornada: 3,
        tipo: 'ENTRADA',
        duplicado: false,
        resultadoGeocerca: 'NO_APLICA',
        distanciaGeocercaMetros: null,
        requiereRevision: false,
        advertencias: [],
        rechazado: false,
        motivoRechazo: null,
        codigoRechazo: null,
        jornada: {
            estatusJornada: 'ABIERTA',
            minutosTrabajados: 0,
            minutosRetardo: 0,
            minutosComida: 0,
            siguienteAccion: { sugerido: 'SALIDA', permitidos: ['SALIDA'] },
        },
        ...parcial,
    };
}

describe('Checadas del kiosco', () => {
    let service: KioskDeviceService;
    let prisma: {
        kioscosAsistencia: { findUnique: jest.Mock };
        kioscoSites: { findMany: jest.Mock; findFirst: jest.Mock };
        empleados: { findFirst: jest.Mock; findMany: jest.Mock };
        relEmpleadosSites: { findFirst: jest.Mock; findMany: jest.Mock };
        asistenciaEvidencias: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
        registrosAsistencia: { findUnique: jest.Mock };
        registrosKioscoPorIdentificar: { findUnique: jest.Mock; create: jest.Mock };
        $transaction: jest.Mock;
    };
    let engine: { registerCheck: jest.Mock; resolveContext: jest.Mock; resolveNextType: jest.Mock };

    beforeEach(() => {
        prisma = {
            kioscosAsistencia: { findUnique: jest.fn(async () => ({ politicas: politicas() })) },
            kioscoSites: {
                findMany: jest.fn(async () => [{ idSite: 20 }, { idSite: 10 }]),
                findFirst: jest.fn(async () => ({ idSite: 10 })),
            },
            empleados: { findFirst: jest.fn(), findMany: jest.fn() },
            relEmpleadosSites: { findFirst: jest.fn(), findMany: jest.fn() },
            asistenciaEvidencias: {
                create: jest.fn(async () => ({ idEvidencia: 15 })),
                findUnique: jest.fn(),
                updateMany: jest.fn(async () => ({ count: 1 })),
            },
            registrosAsistencia: { findUnique: jest.fn(async () => null) },
            registrosKioscoPorIdentificar: {
                findUnique: jest.fn(async () => null),
                create: jest.fn(async () => ({ idPorIdentificar: 1n })),
            },
            $transaction: jest.fn(),
        };
        prisma.$transaction.mockImplementation(async (trabajo: (tx: typeof prisma) => Promise<unknown>) =>
            trabajo(prisma),
        );
        engine = {
            registerCheck: jest.fn(async (input: { tipo: 'ENTRADA' | 'SALIDA'; rostroDetectado?: boolean | null; deteccionRostroActiva?: boolean | null }) =>
                resultadoMotor({
                    tipo: input.tipo,
                    requiereRevision: input.deteccionRostroActiva === true && input.rostroDetectado === false,
                    advertencias:
                        input.deteccionRostroActiva === true && input.rostroDetectado === false
                            ? ['SIN_ROSTRO']
                            : [],
                }),
            ),
            resolveContext: jest.fn(),
            resolveNextType: jest.fn(),
        };

        service = new KioskDeviceService(
            prisma as unknown as PrismaService,
            {} as AttendanceTrackingConfigService,
            engine as unknown as AttendanceEngineService,
            { get: jest.fn() } as unknown as ConfigService,
        );
    });

    function empleadoEnPadron() {
        prisma.empleados.findFirst.mockResolvedValue({
            idEmpleado: 8,
            numeroEmpleado: '100',
            nombre: 'Ana',
            primerApellido: 'Ruiz',
            activo: true,
            idSite: 10,
        });
    }

    function evidenciaValida(rostroDetectado = true) {
        prisma.asistenciaEvidencias.findUnique.mockResolvedValue({
            idEvidencia: 15,
            idKiosco: 5,
            idEmpresa: 9,
            consumida: false,
            rostroDetectado,
        });
    }

    it('guarda la foto del kiosco sin empleado', async () => {
        const file = {
            buffer: Buffer.from('foto'),
            mimetype: 'image/jpeg',
            size: 4,
        } as Express.Multer.File;

        const result = await service.subirEvidencia(kiosco, file, true);

        expect(saveFileLocal).toHaveBeenCalledWith(
            file,
            expect.stringMatching(/^attendance\/kiosk\/9\/\d{4}\/\d{2}$/),
            expect.stringMatching(/\.jpg$/),
        );
        expect(prisma.asistenciaEvidencias.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                idTenant: 3,
                idEmpresa: 9,
                idEmpleado: null,
                idKiosco: 5,
                rostroDetectado: true,
                tipo: 'SELFIE',
                mimeType: 'image/jpeg',
                consumida: false,
            }),
            select: { idEvidencia: true },
        });
        expect(result).toEqual({ idEvidencia: 15 });
    });

    it('registra la entrada con foto', async () => {
        empleadoEnPadron();
        evidenciaValida();

        const result = await service.check(kiosco, checada());

        expect(engine.registerCheck).toHaveBeenCalledWith(expect.objectContaining({
            canal: 'KIOSCO',
            idKiosco: 5,
            idSitioKiosco: 10,
            idEmpleado: 8,
            metodoIdentificacion: 'NUMERO',
            numeroEmpleadoCapturado: '100',
            rostroDetectado: true,
            deteccionRostroActiva: false,
            esOffline: false,
            uuidCliente: UUID_A,
            idEvidencia: 15,
            tipo: 'ENTRADA',
            modoInferencia: 'EXPLICITO',
        }));
        expect(result).toEqual({
            resultado: 'REGISTRADO',
            empleado: { nombreCorto: 'Ana Ruiz', numeroEmpleado: '100' },
            idRegistro: '77',
            tipo: 'ENTRADA',
            requiereRevision: false,
            advertencias: [],
            mensaje: 'Entrada registrada',
        });
    });

    it('registra sin foto cuando el kiosco no la exige', async () => {
        prisma.kioscosAsistencia.findUnique.mockResolvedValue({
            politicas: politicas({ requiereFoto: false }),
        });
        empleadoEnPadron();

        const result = await service.check(kiosco, checada({ idEvidencia: null }));

        expect(prisma.asistenciaEvidencias.findUnique).not.toHaveBeenCalled();
        expect(engine.registerCheck).toHaveBeenCalledWith(expect.objectContaining({
            idEvidencia: null,
            rostroDetectado: null,
        }));
        expect(result.resultado).toBe('REGISTRADO');
        expect(result.mensaje).toBe('Entrada registrada');
    });

    it('exige evidencia del mismo kiosco y sin consumir', async () => {
        const sinFoto = await service.check(kiosco, checada({ idEvidencia: null })).catch((error) => error);
        expect(sinFoto.getStatus()).toBe(400);
        expect(sinFoto.getResponse()).toEqual(expect.objectContaining({ code: 'EVIDENCIA_REQUERIDA' }));

        prisma.asistenciaEvidencias.findUnique.mockResolvedValue({
            idEvidencia: 15,
            idKiosco: 99,
            idEmpresa: 9,
            consumida: false,
            rostroDetectado: true,
        });
        const ajena = await service.check(kiosco, checada()).catch((error) => error);
        expect(ajena.getResponse()).toEqual(expect.objectContaining({ code: 'EVIDENCIA_REQUERIDA' }));
        expect(engine.registerCheck).not.toHaveBeenCalled();
    });

    it('rechaza en línea una foto sin rostro y en sync la acepta con la bandera', async () => {
        prisma.kioscosAsistencia.findUnique.mockResolvedValue({
            politicas: politicas({ deteccionRostro: true }),
        });
        evidenciaValida(false);
        empleadoEnPadron();

        const enLinea = await service.check(kiosco, checada()).catch((error) => error);
        expect(enLinea.getStatus()).toBe(400);
        expect(enLinea.getResponse()).toEqual({
            code: 'SIN_ROSTRO',
            message: 'No se ve tu cara en la foto. Inténtalo de nuevo.',
        });
        expect(engine.registerCheck).not.toHaveBeenCalled();

        const sincronizada = await service.sync(kiosco, { items: [checada()] });

        expect(engine.registerCheck).toHaveBeenCalledWith(expect.objectContaining({
            rostroDetectado: false,
            deteccionRostroActiva: true,
        }));
        expect(sincronizada.resultados[0]).toEqual(expect.objectContaining({
            ok: true,
            reintentable: false,
            resultado: expect.objectContaining({
                resultado: 'REGISTRADO',
                requiereRevision: true,
                advertencias: ['SIN_ROSTRO'],
            }),
        }));
    });

    it.each([
        {
            nombre: 'no encontrado',
            fila: null,
            codigo: 'EMPLEADO_NO_ENCONTRADO',
            candidato: null,
        },
        {
            nombre: 'inactivo',
            fila: {
                idEmpleado: 8,
                numeroEmpleado: '100',
                nombre: 'Ana',
                primerApellido: 'Ruiz',
                activo: false,
                idSite: 10,
            },
            codigo: 'EMPLEADO_INACTIVO',
            candidato: 8,
        },
        {
            nombre: 'no asignado',
            fila: {
                idEmpleado: 8,
                numeroEmpleado: '100',
                nombre: 'Ana',
                primerApellido: 'Ruiz',
                activo: true,
                idSite: 99,
            },
            codigo: 'EMPLEADO_NO_ASIGNADO',
            candidato: 8,
        },
    ])('con la política activa guarda la incidencia $nombre', async ({ fila, codigo, candidato }) => {
        prisma.kioscosAsistencia.findUnique.mockResolvedValue({
            politicas: politicas({ aceptarNoIdentificados: true, requiereFoto: false }),
        });
        prisma.empleados.findFirst.mockResolvedValue(fila);
        prisma.relEmpleadosSites.findFirst.mockResolvedValue(null);

        const result = await service.check(kiosco, checada({
            idEvidencia: null,
            esOffline: true,
            desfaseRelojSegundos: 12,
        }));

        expect(result).toEqual({
            resultado: 'POR_IDENTIFICAR',
            empleado: null,
            idRegistro: null,
            tipo: 'ENTRADA',
            requiereRevision: false,
            advertencias: [],
            mensaje: 'Registro guardado. RH lo revisará.',
        });
        expect(prisma.registrosKioscoPorIdentificar.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                tipoIncidencia: codigo,
                idEmpleadoCandidato: candidato,
                idSite: 10,
                numeroCapturado: '100',
                tipo: 'ENTRADA',
                idEvidencia: null,
                uuidCliente: UUID_A,
                metodoIdentificacion: 'NUMERO',
                esOffline: true,
                desfaseRelojSegundos: 12,
                estatus: 'PENDIENTE',
            }),
        });
        expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
            maxWait: 5000,
            timeout: 15000,
        });
        expect(engine.registerCheck).not.toHaveBeenCalled();
    });

    it.each([
        ['EMPLEADO_NO_ENCONTRADO', 404, null],
        ['EMPLEADO_INACTIVO', 409, {
            idEmpleado: 8,
            numeroEmpleado: '100',
            nombre: 'Ana',
            primerApellido: 'Ruiz',
            activo: false,
            idSite: 10,
        }],
        ['EMPLEADO_NO_ASIGNADO', 409, {
            idEmpleado: 8,
            numeroEmpleado: '100',
            nombre: 'Ana',
            primerApellido: 'Ruiz',
            activo: true,
            idSite: 99,
        }],
    ] as const)('con la política apagada responde %s', async (codigo, status, fila) => {
        evidenciaValida();
        prisma.empleados.findFirst.mockResolvedValue(fila);
        prisma.relEmpleadosSites.findFirst.mockResolvedValue(null);

        const error = await service.check(kiosco, checada({ idEvidencia: 15 })).catch((causa) => causa);

        expect(error.getStatus()).toBe(status);
        expect(error.getResponse()).toEqual(expect.objectContaining({ code: codigo }));
        expect(prisma.registrosKioscoPorIdentificar.create).not.toHaveBeenCalled();
    });

    it('no acepta una checada offline si el kiosco no lo permite', async () => {
        prisma.kioscosAsistencia.findUnique.mockResolvedValue({
            politicas: politicas({ requiereFoto: false, permitirOffline: false }),
        });
        empleadoEnPadron();

        const error = await service.check(kiosco, checada({
            idEvidencia: null,
            esOffline: true,
        })).catch((causa) => causa);

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'OFFLINE_NO_PERMITIDO' }));
        expect(engine.registerCheck).not.toHaveBeenCalled();
    });

    it('en sync acepta la checada offline aunque la política esté apagada', async () => {
        prisma.kioscosAsistencia.findUnique.mockResolvedValue({
            politicas: politicas({ requiereFoto: false, permitirOffline: false }),
        });
        empleadoEnPadron();

        const result = await service.sync(kiosco, {
            items: [checada({ idEvidencia: null, esOffline: true })],
        });

        expect(result.resultados[0].ok).toBe(true);
        expect(engine.registerCheck).toHaveBeenCalledWith(expect.objectContaining({ esOffline: true }));
    });

    it('un uuid ya registrado responde duplicado con el resultado original', async () => {
        prisma.registrosAsistencia.findUnique.mockResolvedValue({
            idRegistro: 77n,
            tipo: 'SALIDA',
            estatusProcesamiento: 'PROCESADO',
            requiereRevision: false,
            numeroEmpleadoCapturado: '100',
            Empleados: { numeroEmpleado: '100', nombre: 'Ana', primerApellido: 'Ruiz' },
        });

        const result = await service.check(kiosco, checada({ tipo: 'SALIDA' }));

        expect(result).toEqual({
            resultado: 'DUPLICADO',
            empleado: { nombreCorto: 'Ana Ruiz', numeroEmpleado: '100' },
            idRegistro: '77',
            tipo: 'SALIDA',
            requiereRevision: false,
            advertencias: [],
            mensaje: 'Salida registrada',
        });
        expect(engine.registerCheck).not.toHaveBeenCalled();
    });

    it('un uuid rechazado antes no dice que la checada ya estaba registrada', async () => {
        prisma.registrosAsistencia.findUnique.mockResolvedValue({
            idRegistro: 77n,
            tipo: 'ENTRADA',
            estatusProcesamiento: 'RECHAZADO',
            requiereRevision: false,
            numeroEmpleadoCapturado: '100',
            Empleados: { numeroEmpleado: '100', nombre: 'Ana', primerApellido: 'Ruiz' },
        });

        const error = await service.check(kiosco, checada()).catch((causa) => causa);

        expect(error.getStatus()).toBe(409);
        expect(error.getResponse().code).toBe('TRANSICION_INVALIDA');
        expect(JSON.stringify(error.getResponse())).not.toMatch(/ya estaba registrada/i);
        expect(engine.registerCheck).not.toHaveBeenCalled();
    });

    it('traduce la transición inválida del motor a 409', async () => {
        empleadoEnPadron();
        evidenciaValida();
        engine.registerCheck.mockRejectedValue(new UnprocessableEntityException({
            message: 'No puedes registrar ENTRADA ahora. Las acciones permitidas son: SALIDA.',
            code: 'TRANSICION_INVALIDA',
            detail: { estadoActual: 'ENTRADA', permitidos: ['SALIDA'] },
        }));

        const error = await service.check(kiosco, checada()).catch((causa) => causa);

        expect(error.getStatus()).toBe(409);
        expect(error.getResponse()).toEqual({
            code: 'TRANSICION_INVALIDA',
            message: 'No puedes registrar ENTRADA ahora. Las acciones permitidas son: SALIDA.',
            detail: { estadoActual: 'ENTRADA', permitidos: ['SALIDA'] },
        });
    });

    it('sincroniza los ítems válidos en orden de hora y aísla el inválido', async () => {
        empleadoEnPadron();
        prisma.kioscosAsistencia.findUnique.mockResolvedValue({
            politicas: politicas({ requiereFoto: false }),
        });

        const result = await service.sync(kiosco, {
            items: [
                checada({
                    uuidCliente: UUID_B,
                    tipo: 'SALIDA',
                    fechaHoraRegistro: '2026-11-11T18:00:00.000Z',
                    idEvidencia: null,
                }),
                { ...checada({ uuidCliente: UUID_C, idEvidencia: null }), tipo: 'COMIDA' } as unknown as ChecadaKioscoDto,
                checada({
                    uuidCliente: UUID_A,
                    tipo: 'ENTRADA',
                    fechaHoraRegistro: '2026-11-11T14:00:00.000Z',
                    idEvidencia: null,
                }),
            ],
        });

        expect(engine.registerCheck.mock.calls.map((call) => call[0].uuidCliente)).toEqual([UUID_A, UUID_B]);
        expect(result.resultados).toEqual([
            expect.objectContaining({
                uuidCliente: UUID_B,
                ok: true,
                reintentable: false,
                resultado: expect.objectContaining({ tipo: 'SALIDA', resultado: 'REGISTRADO' }),
            }),
            expect.objectContaining({
                uuidCliente: UUID_C,
                ok: false,
                codigo: 'DATOS_INVALIDOS',
                mensaje: 'tipo debe ser ENTRADA o SALIDA.',
                reintentable: false,
            }),
            expect.objectContaining({
                uuidCliente: UUID_A,
                ok: true,
                reintentable: false,
                resultado: expect.objectContaining({ tipo: 'ENTRADA', resultado: 'REGISTRADO' }),
            }),
        ]);
    });
});
