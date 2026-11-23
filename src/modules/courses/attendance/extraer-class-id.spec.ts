import { extraerClassId } from './extraer-class-id';

describe('extraerClassId', () => {
    const token = 'aa11:bb22';

    it('acepta la URL completa, el id cifrado y el id con encoding', () => {
        const url = `https://front.example/attendance/class/${encodeURIComponent(token)}`;

        expect(extraerClassId(url)).toBe(token);
        expect(extraerClassId(token)).toBe(token);
        expect(extraerClassId(encodeURIComponent(token))).toBe(token);
        expect(extraerClassId(`attendance/class/${encodeURIComponent(token)}`)).toBe(token);
    });

    it('deja la basura para que el descifrado la rechace', () => {
        expect(extraerClassId('esto-no-es-un-qr')).toBe('esto-no-es-un-qr');
        expect(extraerClassId('%')).toBe('%');
        expect(extraerClassId('   ')).toBe('');
    });
});
