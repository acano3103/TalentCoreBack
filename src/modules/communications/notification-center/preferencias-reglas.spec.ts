import { debeEnviarCanal, preferenciaBloqueada } from './preferencias-reglas';

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
});
