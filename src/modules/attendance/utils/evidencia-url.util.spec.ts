import { urlEvidencia } from './evidencia-url.util';

describe('urlEvidencia', () => {
  const previa = process.env.MEDIA_PUBLIC_URL_BASE;

  afterEach(() => {
    if (previa === undefined) delete process.env.MEDIA_PUBLIC_URL_BASE;
    else process.env.MEDIA_PUBLIC_URL_BASE = previa;
  });

  it('devuelve null si no hay ruta', () => {
    delete process.env.MEDIA_PUBLIC_URL_BASE;
    expect(urlEvidencia(null)).toBeNull();
    expect(urlEvidencia('')).toBeNull();
    expect(urlEvidencia('   ')).toBeNull();
  });

  it('deja igual una URL de Artemis', () => {
    delete process.env.MEDIA_PUBLIC_URL_BASE;
    expect(urlEvidencia('https://artemis.example/foto.jpg')).toBe(
      'https://artemis.example/foto.jpg',
    );
    expect(urlEvidencia('http://artemis.example/foto.jpg')).toBe(
      'http://artemis.example/foto.jpg',
    );
  });

  it('antepone el proxy a una ruta /media y a una ruta legacy', () => {
    delete process.env.MEDIA_PUBLIC_URL_BASE;
    expect(urlEvidencia('/media/x/a.jpg')).toBe('/api/proxy-v2/media/x/a.jpg');
    expect(urlEvidencia('media/attendance/a.jpg')).toBe(
      '/api/proxy-v2/media/attendance/a.jpg',
    );
  });

  it('usa el prefijo configurado en MEDIA_PUBLIC_URL_BASE', () => {
    process.env.MEDIA_PUBLIC_URL_BASE = 'https://archivos.ejemplo/privado/';
    expect(urlEvidencia('/media/x/a.jpg')).toBe(
      'https://archivos.ejemplo/privado/media/x/a.jpg',
    );
  });
});
