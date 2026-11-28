import { CoursesService } from '../courses.service';
import { estadoPaginaPublica, ventanaAsistencia } from './ventana-asistencia';

const INICIO = new Date('2026-11-20T18:00:00.000Z');
const FIN = new Date('2026-11-20T19:00:00.000Z');

function servicio() {
    const prisma = {
        cursoFechasClase: {
            findUnique: jest.fn().mockResolvedValue({
                idFechaClase: 10,
                tituloClase: 'Sesión 1',
                fechaHoraInicio: INICIO,
                fechaHoraFin: FIN,
                CursoAsistencias: [],
                CursoSesiones: {
                    minutosToleranciaQr: 15,
                    ubicacionFisica: 'Sala A',
                    CatCursos: { Descripcion: 'Inducción' },
                    CursoParticipantes: [],
                },
            }),
        },
        cursoAsistencias: { upsert: jest.fn().mockResolvedValue({}) },
        empleados: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const crypto = { decrypt: jest.fn().mockReturnValue('10'), encrypt: jest.fn() };
    const service = new CoursesService(prisma as any, {} as any, crypto as any);
    return { prisma, crypto, service };
}

describe('pase de lista público', () => {
    afterEach(() => jest.useRealTimers());

    it.each([
        ['antes', '2026-11-20T17:30:00.000Z'],
        ['durante', '2026-11-20T17:50:00.000Z'],
        ['después', '2026-11-20T19:30:00.000Z'],
    ])('la ventana del GET y del POST es la misma %s', async (_nombre, marca) => {
        jest.useFakeTimers({ now: new Date(marca) });
        const { prisma, service } = servicio();
        const esperada = ventanaAsistencia({
            fechaHoraInicio: INICIO,
            fechaHoraFin: FIN,
            minutosToleranciaQr: 15,
            ahora: new Date(marca),
        });

        const info = await service.getAttendanceInfo('iv:token');

        expect(info.status).toBe(estadoPaginaPublica(esperada.estado));
        expect(info.message).toBe(esperada.mensaje);
        expect(info.curso.nombreCurso).toBe('Inducción');

        if (esperada.estado === 'abierta') {
            await expect(service.registerAttendance({ classId: 'iv%3Atoken', idEmpleado: 50 })).resolves.toEqual({
                success: true,
                message: 'Asistencia registrada exitosamente.',
            });
            expect(prisma.cursoAsistencias.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    create: expect.objectContaining({ metodoRegistro: 'qr_autoatendido', idEmpleado: 50 }),
                }),
            );
        } else {
            await expect(service.registerAttendance({ classId: 'iv:token', idEmpleado: 50 })).rejects.toMatchObject({
                status: 409,
                response: { message: esperada.mensaje },
            });
            expect(prisma.cursoAsistencias.upsert).not.toHaveBeenCalled();
        }
    });
});
