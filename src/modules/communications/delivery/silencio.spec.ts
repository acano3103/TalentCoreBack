import { decisionSilencio } from './silencio';
import { planearCanales } from './plan-canales';

const zona = 'America/Mexico_City';
const lunes = [{ dia: 'Lunes', entrada: 8 * 60, salida: 17 * 60 }];
const sabadoNoche = new Date('2026-11-15T04:00:00.000Z');
const martesManana = new Date('2026-11-17T16:00:00.000Z');

describe('silencio por turno', () => {
    it('difiere el push al inicio del siguiente turno y deja la app al momento', () => {
        const push = decisionSilencio({
            ahora: sabadoNoche,
            zonaHoraria: zona,
            turnos: lunes,
            prioridad: 'NORMAL',
            canalInmediato: false,
            silencio: null,
        });
        const app = decisionSilencio({
            ahora: sabadoNoche,
            zonaHoraria: zona,
            turnos: lunes,
            prioridad: 'NORMAL',
            canalInmediato: true,
            silencio: null,
        });
        expect(push.inmediato).toBe(false);
        expect(push.en.toISOString()).toBe('2026-11-16T14:00:00.000Z');
        expect(app.inmediato).toBe(true);
    });

    it('dentro del turno envía el push de inmediato', () => {
        const decision = decisionSilencio({
            ahora: martesManana,
            zonaHoraria: zona,
            turnos: [{ dia: 'Martes', entrada: 8 * 60, salida: 17 * 60 }],
            prioridad: 'IMPORTANTE',
            canalInmediato: false,
            silencio: null,
        });
        expect(decision.inmediato).toBe(true);
    });

    it('una crítica no espera al turno', () => {
        const decision = decisionSilencio({
            ahora: sabadoNoche,
            zonaHoraria: zona,
            turnos: lunes,
            prioridad: 'CRITICA',
            canalInmediato: false,
            silencio: null,
        });
        expect(decision.inmediato).toBe(true);
    });

    it('sin turno usa la ventana de silencio de la empresa', () => {
        const decision = decisionSilencio({
            ahora: sabadoNoche,
            zonaHoraria: zona,
            turnos: [],
            prioridad: 'NORMAL',
            canalInmediato: false,
            silencio: { activo: true, inicio: '21:00', fin: '07:00' },
        });
        expect(decision.inmediato).toBe(false);
        expect(decision.en.toISOString()).toBe('2026-11-15T13:00:00.000Z');
    });

    it('el plan manda la app ahora y el push al siguiente turno', () => {
        const planes = planearCanales({
            canales: ['APP', 'WEB'],
            prioridad: 'NORMAL',
            ahora: sabadoNoche,
            zonaHoraria: zona,
            turnos: lunes,
            silencio: null,
        });
        expect(planes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ codigo: 'SOCKETS', enviarAhora: true }),
                expect.objectContaining({ codigo: 'PUSH', enviarAhora: false, en: new Date('2026-11-16T14:00:00.000Z') }),
            ]),
        );
        expect(planes.find((plan) => plan.codigo === 'KIOSCO')).toBeUndefined();
    });
});
