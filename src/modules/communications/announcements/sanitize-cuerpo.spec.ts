import { aTextoPlano, sanitizarCuerpo } from './sanitize-cuerpo';

describe('sanitizarCuerpo', () => {
    it('quita scripts, eventos y javascript', () => {
        const limpio = sanitizarCuerpo('<script>alert(1)</script><p onclick="x">Hola</p><a href="javascript:alert(1)">malo</a>');
        expect(limpio).not.toContain('script');
        expect(limpio).not.toContain('onclick');
        expect(limpio).not.toContain('javascript:');
        expect(limpio).toContain('Hola');
    });

    it('conserva el formato permitido y blinda el enlace', () => {
        const limpio = sanitizarCuerpo('<h2>Título</h2><p><strong>Hola</strong></p><a href="https://ejemplo.test" target="_blank">ir</a>');
        expect(limpio).toContain('<h2>Título</h2>');
        expect(limpio).toContain('<strong>Hola</strong>');
        expect(limpio).toContain('rel="noopener noreferrer"');
        expect(limpio).toContain('href="https://ejemplo.test"');
    });

    it('deja el aviso operativo en texto plano', () => {
        expect(aTextoPlano('<p>Hola <b>equipo</b></p><script>x</script>')).toBe('Hola equipo');
    });
});
