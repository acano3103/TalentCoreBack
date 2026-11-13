import { idEmpresaDeRuta, normalizarRaiz, rutaNueva } from './migrar-evidencias-asistencia';

describe('migrar evidencias de asistencia', () => {
    it('quita el prefijo media/ y antepone el slug', () => {
        expect(rutaNueva('media/attendance/1/2026/11/a.jpg', 'acme')).toBe(
            'acme/attendance/1/2026/11/a.jpg',
        );
    });

    it('conserva attendance/kiosk cuando la ruta vieja no trae media/', () => {
        expect(rutaNueva('attendance/kiosk/3/2026/11/b.jpg', 'acme')).toBe(
            'acme/attendance/kiosk/3/2026/11/b.jpg',
        );
    });

    it('rechaza una ruta que se sale con ..', () => {
        expect(rutaNueva('media/attendance/../secreto.jpg', 'acme')).toBeNull();
        expect(rutaNueva('attendance/../../etc/passwd', 'acme')).toBeNull();
    });

    it('normaliza comillas y espacios sobrantes de la raíz', () => {
        expect(normalizarRaiz('C:\\x\\Media"')).toBe('C:\\x\\Media');
        expect(normalizarRaiz('  "C:\\x\\Media"  ')).toBe('C:\\x\\Media');
    });

    it('saca el id de empresa de la ruta del kiosco y de la app', () => {
        expect(idEmpresaDeRuta('attendance/kiosk/3/2026/11/b.jpg')).toBe(3);
        expect(idEmpresaDeRuta('attendance/1/2026/11/a.jpg')).toBe(1);
        expect(idEmpresaDeRuta('media/attendance/kiosk/9/2026/11/foto.jpg')).toBe(9);
    });
});
