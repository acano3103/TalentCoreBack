import { aExpo } from './push.provider';

const base = {
    to: 'ExponentPushToken[abc]',
    title: 'Aviso',
    body: 'Texto',
    idNotificacion: 'notif-1',
    badge: 4,
    destino: '{"tipo":"MI_COMUNICADO","id":9}',
};

describe('aExpo', () => {
    it('una crítica usa el canal criticos, prioridad alta y time-sensitive', () => {
        const mensaje = aExpo({ ...base, prioridad: 'CRÍTICA', categoria: 'COMUNICADO' });
        expect(mensaje.channelId).toBe('criticos');
        expect(mensaje.priority).toBe('high');
        expect(mensaje.interruptionLevel).toBe('time-sensitive');
        expect(mensaje.badge).toBe(4);
        expect(mensaje.data).toEqual({
            destino: '{"tipo":"MI_COMUNICADO","id":9}',
            idNotificacion: 'notif-1',
            prioridad: 'CRITICA',
            categoria: 'COMUNICADO',
        });
    });

    it('un aviso importante sale por el canal avisos y con prioridad alta', () => {
        const mensaje = aExpo({ ...base, prioridad: 'IMPORTANTE', categoria: 'AVISO' });
        expect(mensaje.channelId).toBe('avisos');
        expect(mensaje.priority).toBe('high');
        expect(mensaje.interruptionLevel).toBeUndefined();
    });

    it('un comunicado normal usa avisos y un recordatorio su propio canal', () => {
        expect(aExpo({ ...base, prioridad: 'NORMAL', categoria: 'COMUNICADO' }).channelId).toBe('avisos');
        const recordatorio = aExpo({ ...base, prioridad: 'NORMAL', categoria: 'RECORDATORIO' });
        expect(recordatorio.channelId).toBe('recordatorios');
        expect(recordatorio.priority).toBe('default');
    });

    it('lo demás cae en el canal general', () => {
        const mensaje = aExpo({ ...base, prioridad: 'NORMAL', categoria: 'SISTEMA' });
        expect(mensaje.channelId).toBe('general');
        expect(mensaje.priority).toBe('default');
        expect(mensaje.data).toEqual(expect.objectContaining({ prioridad: 'NORMAL', categoria: 'SISTEMA' }));
    });
});
