jest.mock('fs-extra', () => ({
    pathExists: jest.fn(),
}));

import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as fs from 'fs-extra';
import { CourseScormService, ScormPlayClaims } from './course-scorm.service';

const claims: ScormPlayClaims = { idParticipante: 5, idSesion: 1, idEmpresa: 7, idTenant: 4, idEmpleado: 9 };

function participacion(idTenant = 4) {
    return {
        idParticipante: 5,
        idEmpleado: 9,
        CursoSesiones: {
            estatus: 'programado',
            fechaInicioPeriodo: new Date('2020-01-01T00:00:00Z'),
            fechaFinPeriodo: null,
            CatCursos: { idTenant, Descripcion: 'Inducción', calificacionAprobatoria: 70 },
        },
        Empleados: { nombre: 'Ana', primerApellido: 'Pérez', auth_user: { first_name: 'Ana', last_name: 'Pérez' } },
    };
}

describe('CourseScormService lanzamiento de la app', () => {
    const prisma = {
        cursoParticipantes: { findFirst: jest.fn() },
        cursoContenidos: { findFirst: jest.fn() },
        cursoScormProgresos: { findUnique: jest.fn() },
    };
    const contenido = { getTenantOrThrow: (user: { idTenant: number }) => user.idTenant, getAsyncSession: jest.fn() };
    const learning = { getAvailability: jest.fn().mockReturnValue({ disponible: true, motivo: null }) };
    let service: CourseScormService;

    beforeEach(() => {
        jest.clearAllMocks();
        (fs.pathExists as unknown as jest.Mock).mockResolvedValue(true);
        learning.getAvailability.mockReturnValue({ disponible: true, motivo: null });
        service = new CourseScormService(
            prisma as any,
            {} as any,
            { get: () => undefined } as any,
            contenido as any,
            learning as any,
            {} as any,
        );
    });

    it('un token de otra sesión no abre los archivos de esta', async () => {
        prisma.cursoParticipantes.findFirst.mockImplementation(async ({ where }: { where: { idSesion: number } }) =>
            where.idSesion === 1 ? participacion() : null,
        );

        await expect(service.assertPlayAccess({ ...claims, idSesion: 2 })).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(service.assertPlayAccess(claims)).resolves.toBeUndefined();
        expect(prisma.cursoParticipantes.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ idParticipante: 5, idSesion: 2, idEmpleado: 9 }),
            }),
        );
    });

    it('rechaza un participante de otro tenant y recuerda el acceso válido', async () => {
        prisma.cursoParticipantes.findFirst.mockResolvedValue(participacion(99));
        await expect(service.assertPlayAccess(claims)).rejects.toBeInstanceOf(UnauthorizedException);

        prisma.cursoParticipantes.findFirst.mockResolvedValue(participacion());
        await service.assertPlayAccess(claims);
        await service.assertPlayAccess(claims);
        expect(prisma.cursoParticipantes.findFirst).toHaveBeenCalledTimes(2);
    });

    it('arma el launcher con el nombre del alumno y el suspend_data guardado', async () => {
        prisma.cursoParticipantes.findFirst.mockResolvedValue(participacion());
        prisma.cursoContenidos.findFirst.mockResolvedValue({
            tipoContenido: 'scorm',
            CursoPaquetesScorm: { version: 'scorm_12', archivoInicio: 'index_lms.html' },
            CursoModulos: [{ CursoLecciones: [{ idLeccion: 3, titulo: 'Inducción' }] }],
        });
        prisma.cursoScormProgresos.findUnique.mockResolvedValue({
            idTenant: 4,
            datosCmi: { 'cmi.suspend_data': 's4', 'cmi.core.lesson_location': '4' },
            tiempoTotal: '0000:01:00',
            totalIntentos: 2,
        });

        const launch = await service.openForPlay(claims);
        expect(launch.archivoInicio).toBe('index_lms.html');
        expect(launch.alumno).toEqual({ id: '9', nombre: 'Pérez, Ana' });
        expect(launch.estado.entrada).toBe('resume');
        expect(launch.estado.valores['cmi.core.lesson_location']).toBe('4');
        expect(launch.version).toBe('scorm_12');
    });

    it('la web sigue enviando el archivo del tenant sin mirar la inscripción', async () => {
        contenido.getAsyncSession.mockResolvedValue({});
        prisma.cursoContenidos.findFirst.mockResolvedValue({ CursoPaquetesScorm: { rutaArchivo: 'cursos-scorm/paquete' } });
        const res = { headersSent: false, sendFile: jest.fn((_archivo: string, _opciones: { headers: Record<string, string> }, cb: (error?: Error) => void) => cb()) };

        await service.sendFile(7, 1, 'index.html', { id: 1, idTenant: 4 } as any, res as any);
        expect(prisma.cursoParticipantes.findFirst).not.toHaveBeenCalled();
        expect(res.sendFile.mock.calls[0][1].headers['Cache-Control']).toBe('private, max-age=300');

        await service.sendSessionFile(7, 1, 4, 'index.html', res as any, 'private, max-age=3600');
        expect(res.sendFile.mock.calls[1][1].headers['Cache-Control']).toBe('private, max-age=3600');
    });

    it('una ruta fuera del paquete responde 404', async () => {
        contenido.getAsyncSession.mockResolvedValue({});
        prisma.cursoContenidos.findFirst.mockResolvedValue({ CursoPaquetesScorm: { rutaArchivo: 'cursos-scorm/paquete' } });
        const res = { headersSent: false, sendFile: jest.fn() };
        await expect(service.sendSessionFile(7, 1, 4, '../secreto.txt', res as any, 'private, max-age=3600')).rejects.toBeInstanceOf(NotFoundException);
        expect(res.sendFile).not.toHaveBeenCalled();
    });
});

describe('CourseScormService commit de un curso aprobado', () => {
    const emit = jest.fn();
    let estatusAsignacion = 'inscrito';
    let calificacionFinal: number | null = null;
    const sesion = {
        estatus: 'en_curso',
        fechaInicioPeriodo: new Date('2020-01-01T00:00:00Z'),
        fechaFinPeriodo: null,
        CatCursos: { idTenant: 4, Descripcion: 'Inducción', calificacionAprobatoria: 70 },
    };
    const learning = {
        getParticipation: jest.fn(async () => ({
            participacion: {
                idParticipante: 5,
                idEmpleado: 9,
                estatusAsignacion,
                calificacionFinal,
                CursoSesiones: sesion,
            },
            idTenant: 4,
            idEmpleado: 9,
        })),
        getAvailability: jest.fn(() => ({ disponible: true, motivo: null })),
    };
    const tx = {
        cursoScormProgresos: { upsert: jest.fn() },
        cursoLeccionProgresos: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
        cursoParticipantes: {
            update: jest.fn(async ({ data }: { data: { estatusAsignacion: string; calificacionFinal: number } }) => {
                estatusAsignacion = data.estatusAsignacion;
                calificacionFinal = data.calificacionFinal;
            }),
        },
        historicoMovimientos: { create: jest.fn() },
    };
    const prisma = {
        cursoContenidos: { findFirst: jest.fn() },
        cursoScormProgresos: { findUnique: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn(async (fn: (cliente: typeof tx) => unknown) => fn(tx)),
    };
    const tracking = {
        touchActivity: jest.fn(),
        recordQuizAttempt: jest.fn(),
        logEvent: jest.fn(),
        registerCourseEnd: jest.fn(),
    };
    const service = new CourseScormService(
        prisma as any,
        {} as any,
        { get: () => undefined } as any,
        {} as any,
        learning as any,
        tracking as any,
        { emit } as any,
    );
    const dto = {
        terminado: true,
        valores: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '95', 'cmi.core.score.min': '0', 'cmi.core.score.max': '100' },
    };
    const user = { id: 1, idTenant: 4, first_name: 'Ana', last_name: 'Pérez' } as any;

    beforeEach(() => {
        estatusAsignacion = 'inscrito';
        calificacionFinal = null;
        jest.clearAllMocks();
        prisma.cursoContenidos.findFirst.mockResolvedValue({
            tipoContenido: 'scorm',
            CursoPaquetesScorm: { idPaqueteScorm: 1, version: 'scorm_12', archivoInicio: 'index.html' },
            CursoModulos: [{ CursoLecciones: [{ idLeccion: 3, titulo: 'Inducción' }] }],
        });
        emit.mockImplementation(() => {
            throw new Error('el aviso falló');
        });
    });

    it('emite un solo aviso aunque el commit se repita, y el fallo del aviso no tumba el guardado', async () => {
        await expect(service.commit(7, 1, dto, user)).resolves.toMatchObject({
            guardado: true,
            curso: { estatusAsignacion: 'completado', calificacionFinal: 95 },
        });
        await service.commit(7, 1, dto, user);

        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith('comms.curso', expect.objectContaining({
            tipo: 'APROBADO',
            idTenant: 4,
            idEmpresa: 7,
            idEmpleado: 9,
            idSesion: 1,
            curso: 'Inducción',
            calificacion: 95,
        }));
    });
});
