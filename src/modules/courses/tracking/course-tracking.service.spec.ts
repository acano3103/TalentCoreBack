import { localDateString, localDateToPrismaDate } from 'src/modules/attendance/utils/timezone.util';
import { CourseTrackingService } from './course-tracking.service';

const ahora = new Date('2026-06-15T18:30:00.000Z');
const participante = { idTenant: 1, idParticipante: 9 };

function base(ultima: Date | null) {
    return {
        cursoSeguimientoParticipante: {
            findUnique: jest.fn().mockResolvedValue(ultima ? { fechaUltimaActividad: ultima, tiempoTotalSegundos: 0 } : null),
            upsert: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
        },
        cursoBitacoraActividad: { create: jest.fn().mockResolvedValue({}) },
        cursoParticipantes: { findUnique: jest.fn().mockResolvedValue({ CursoSesiones: { idEmpresa: 7 } }) },
        catSites: { findFirst: jest.fn().mockResolvedValue({ zonaHoraria: 'America/Mexico_City' }) },
        cursoTiempoDiario: { upsert: jest.fn().mockResolvedValue({}) },
    };
}

describe('CourseTrackingService.touchActivity', () => {
    const service = new CourseTrackingService({} as any);

    it('el primer acceso no escribe tiempo diario', async () => {
        const db = base(null);
        await service.touchActivity(db as any, participante, ahora);
        expect(db.cursoTiempoDiario.upsert).not.toHaveBeenCalled();
        expect(db.cursoBitacoraActividad.create).toHaveBeenCalled();
    });

    it('un latido de hasta 90 segundos suma los mismos segundos al día local de la empresa', async () => {
        const db = base(new Date(ahora.getTime() - 60_000));
        await service.touchActivity(db as any, participante, ahora);
        const fecha = localDateToPrismaDate(localDateString(ahora, 'America/Mexico_City'));
        expect(db.cursoTiempoDiario.upsert).toHaveBeenCalledWith({
            where: { idParticipante_fecha: { idParticipante: 9, fecha } },
            create: { idParticipante: 9, fecha, idTenant: 1, segundos: 60 },
            update: { segundos: { increment: 60 } },
        });
        expect(db.cursoSeguimientoParticipante.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ tiempoTotalSegundos: { increment: 60 } }) }),
        );
    });

    it('un hueco mayor a 90 segundos no suma tiempo de estudio', async () => {
        const db = base(new Date(ahora.getTime() - 91_000));
        await service.touchActivity(db as any, participante, ahora);
        expect(db.cursoTiempoDiario.upsert).not.toHaveBeenCalled();
        expect(db.cursoSeguimientoParticipante.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.not.objectContaining({ tiempoTotalSegundos: expect.anything() }),
            }),
        );
    });
});
