import { LIMITE_IP, LIMITE_TOKEN, LinkThrottle } from './link-throttle';

describe('límite del enlace seguro', () => {
    const ahora = 1_000_000;

    it('deja 20 por IP y 10 por token en un minuto', () => {
        const cupo = new LinkThrottle();
        for (let i = 0; i < LIMITE_TOKEN; i += 1) {
            expect(cupo.permitir('10.0.0.1', 'abc', ahora)).toBe(true);
        }
        expect(cupo.permitir('10.0.0.2', 'abc', ahora)).toBe(false);
        const otro = new LinkThrottle();
        for (let i = 0; i < LIMITE_IP; i += 1) {
            expect(otro.permitir('10.0.0.8', `token-${i}`, ahora)).toBe(true);
        }
        expect(otro.permitir('10.0.0.8', 'token-extra', ahora)).toBe(false);
        expect(otro.permitir('10.0.0.9', 'token-extra', ahora + 61_000)).toBe(true);
    });
});
