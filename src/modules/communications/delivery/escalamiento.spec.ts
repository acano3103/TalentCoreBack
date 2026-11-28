import { minutosDeEscalamiento, siguienteCanal } from './escalamiento';
import { whatsappBloqueado } from './tope-wa';

const reloj = { importante: 240, critica: 120, correo: 240 };

describe('escalamiento', () => {
    it('sin lectura elige WhatsApp y, si ya se usó, el correo', () => {
        expect(siguienteCanal(['APP', 'WEB'], ['WHATSAPP', 'CORREO'])).toBe('WHATSAPP');
        expect(siguienteCanal(['APP', 'WHATSAPP'], ['WHATSAPP', 'CORREO'])).toBe('CORREO');
    });

    it('si ya leyó no hay canal: el llamador no envía', () => {
        const leido = true;
        const canal = leido ? null : siguienteCanal(['APP'], ['WHATSAPP']);
        expect(canal).toBeNull();
    });

    it('usa los minutos del comunicado o los de la empresa', () => {
        expect(minutosDeEscalamiento('IMPORTANTE', 'WHATSAPP', null, reloj)).toBe(240);
        expect(minutosDeEscalamiento('CRITICA', 'WHATSAPP', { criticaMin: 15 }, reloj)).toBe(15);
        expect(minutosDeEscalamiento('IMPORTANTE', 'CORREO', null, reloj)).toBe(240);
        expect(minutosDeEscalamiento('NORMAL', 'WHATSAPP', null, reloj)).toBeNull();
    });

    it('el tope bloquea lo que no es crítico', () => {
        expect(whatsappBloqueado({ prioridad: 'IMPORTANTE', consumo: 100, tope: 100, accion: 'BLOQUEAR' })).toBe(true);
        expect(whatsappBloqueado({ prioridad: 'CRITICA', consumo: 100, tope: 100, accion: 'BLOQUEAR' })).toBe(false);
        expect(whatsappBloqueado({ prioridad: 'IMPORTANTE', consumo: 10, tope: 100, accion: 'BLOQUEAR' })).toBe(false);
    });
});
