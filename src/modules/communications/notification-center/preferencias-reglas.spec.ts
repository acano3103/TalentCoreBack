import { debeEnviarCanal, fasePreferencia, preferenciaBloqueada, preferenciaNoEditable } from './preferencias-reglas';

describe('preferencias bloqueadas', () => {
    it('no deja apagar aprobaciones ni el sistema en push y correo', () => {
        expect(preferenciaBloqueada('APROBACION', 'PUSH')).toBe(true);
        expect(preferenciaBloqueada('APROBACION', 'WHATSAPP')).toBe(true);
        expect(preferenciaBloqueada('SISTEMA', 'CORREO')).toBe(true);
        expect(preferenciaBloqueada('COMUNICADO', 'PUSH')).toBe(false);
        expect(preferenciaBloqueada('CELEBRACION', 'WHATSAPP')).toBe(false);
    });

    it('envía la crítica y la campana aunque la persona las haya apagado', () => {
        expect(
            debeEnviarCanal({
                codigo: 'PUSH',
                categoria: 'COMUNICADO',
                prioridad: 'NORMAL',
                preferenciaActiva: false,
            }),
        ).toBe(false);
        expect(
            debeEnviarCanal({
                codigo: 'PUSH',
                categoria: 'COMUNICADO',
                prioridad: 'CRITICA',
                preferenciaActiva: false,
            }),
        ).toBe(true);
        expect(
            debeEnviarCanal({
                codigo: 'PUSH',
                notificationTypeCode: 'APROBACION',
                prioridad: 'NORMAL',
                preferenciaActiva: false,
            }),
        ).toBe(true);
        expect(debeEnviarCanal({ codigo: 'SOCKETS', prioridad: 'NORMAL', preferenciaActiva: false })).toBe(true);
        expect(debeEnviarCanal({ codigo: 'EMAIL', categoria: 'RECORDATORIO', prioridad: 'NORMAL', preferenciaActiva: null })).toBe(true);
    });

    it('entrega importante, con acuse y la checada aunque la celda esté apagada', () => {
        expect(debeEnviarCanal({
            codigo: 'PUSH',
            categoria: 'COMUNICADO',
            prioridad: 'IMPORTANTE',
            preferenciaActiva: false,
        })).toBe(true);
        expect(debeEnviarCanal({
            codigo: 'CORREO',
            categoria: 'COMUNICADO',
            prioridad: 'NORMAL',
            requiereAcuse: true,
            preferenciaActiva: false,
        })).toBe(true);
        expect(debeEnviarCanal({
            codigo: 'PUSH',
            categoria: 'RECORDATORIO',
            prioridad: 'NORMAL',
            codigoRegla: 'R1',
            preferenciaActiva: false,
        })).toBe(true);
        expect(debeEnviarCanal({
            codigo: 'WHATSAPP',
            origenId: 'R2:2026-11-16:540',
            prioridad: 'NORMAL',
            preferenciaActiva: false,
        })).toBe(true);
        expect(debeEnviarCanal({
            codigo: 'PUSH',
            origenId: 'R12:2026-11-16:540',
            codigoRegla: 'R12',
            prioridad: 'NORMAL',
            preferenciaActiva: false,
        })).toBe(false);
        expect(debeEnviarCanal({
            codigo: 'PUSH',
            origenId: 'R10:solicitud',
            prioridad: 'NORMAL',
            preferenciaActiva: false,
        })).toBe(false);
    });

    it('deja la celebración visible y sin edición, en fase 2', () => {
        expect(fasePreferencia('CELEBRACION')).toBe(2);
        expect(preferenciaNoEditable('CELEBRACION', 'PUSH')).toBe(true);
        expect(preferenciaBloqueada('CELEBRACION', 'PUSH')).toBe(false);
        expect(fasePreferencia('COMUNICADO')).toBe(1);
    });
});
