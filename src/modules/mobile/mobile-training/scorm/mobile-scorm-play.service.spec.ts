import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { sign, verify } from 'jsonwebtoken';
import { MobileScormPlayService } from './mobile-scorm-play.service';

const SECRETO = 'play-secret';
const claims = { idParticipante: 5, idSesion: 1, idEmpresa: 7, idTenant: 4, idEmpleado: 9 };

function servicio(secretoPlay: string | undefined = SECRETO) {
    const jwt = new JwtService({ secret: 'jwt-de-la-app', signOptions: { expiresIn: '30d' } });
    const config = {
        get: (key: string) => (key === 'SCORM_PLAY_SECRET' ? secretoPlay : key === 'JWT_SECRET' ? 'jwt-de-la-app' : undefined),
    };
    const scorm = {
        getLaunch: jest.fn().mockResolvedValue({
            version: 'scorm_12',
            titulo: 'Inducción',
            disponible: false,
            motivoNoDisponible: 'La sesión ya finalizó.',
            estado: { entrada: 'resume', tiempoTotal: '0000:01:00', totalIntentos: 2, valores: { 'cmi.suspend_data': 'x' } },
        }),
        openForPlay: jest.fn(),
        assertPlayAccess: jest.fn(),
        sendSessionFile: jest.fn(),
    };
    const learning = {
        getParticipation: jest.fn().mockResolvedValue({
            participacion: { idParticipante: 5 },
            idEmpleado: 9,
            idTenant: 4,
        }),
    };
    const user = { id: 3, idTenant: 4, first_name: 'Ana', last_name: 'Pérez', accessToken: 'eyJhbGciOiJIUzI1NiJ9.mobile.jwt' };
    return { service: new MobileScormPlayService(jwt, config as any, scorm as any, learning as any), scorm, learning, user };
}

describe('MobileScormPlayService', () => {
    it('firma un token de 4 horas sin el JWT móvil', async () => {
        const { service, scorm, learning, user } = servicio();
        const respuesta = await service.crear(7, 1, user as any);

        expect(scorm.getLaunch).toHaveBeenCalledWith(7, 1, user);
        expect(learning.getParticipation).toHaveBeenCalledWith(7, 1, user);
        const token = respuesta.urlLanzador.split('/')[2];
        const payload = verify(token, SECRETO, { audience: 'scorm-play' }) as { exp: number; iat: number };
        expect(payload.exp - payload.iat).toBe(4 * 60 * 60);
        expect(Object.keys(payload).sort()).toEqual(
            ['aud', 'exp', 'iat', 'idEmpleado', 'idEmpresa', 'idParticipante', 'idSesion', 'idTenant'].sort(),
        );
        expect(JSON.stringify(payload)).not.toContain('eyJhbGci');
        expect(respuesta.urlLanzador).toBe(`mobile/scorm-play/${token}/index.html`);
        expect(respuesta.expiraEn).toBe(new Date(payload.exp * 1000).toISOString());
        expect(respuesta.disponible).toBe(false);
        expect(respuesta.motivoNoDisponible).toBe('La sesión ya finalizó.');
        expect(respuesta.estado).toEqual({ entrada: 'resume', tiempoTotal: '0000:01:00', totalIntentos: 2 });
    });

    it('si no hay SCORM_PLAY_SECRET usa JWT_SECRET', async () => {
        const { service, user } = servicio('');
        const respuesta = await service.crear(7, 1, user as any);
        const token = respuesta.urlLanzador.split('/')[2];
        expect(verify(token, 'jwt-de-la-app', { audience: 'scorm-play' })).toMatchObject(claims);
    });

    it.each([
        ['vencido', () => sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 }, SECRETO, { audience: 'scorm-play' })],
        ['otro secreto', () => sign(claims, 'otro-secreto', { audience: 'scorm-play', expiresIn: '1h' })],
        ['otra audiencia', () => sign(claims, SECRETO, { audience: 'mobile', expiresIn: '1h' })],
    ])('rechaza un token %s', async (_nombre, firmar) => {
        const { service, scorm } = servicio();
        await expect(service.html(firmar())).rejects.toBeInstanceOf(UnauthorizedException);
        expect(scorm.openForPlay).not.toHaveBeenCalled();
    });

    it('un token de otra sesión no entrega archivos de esta', async () => {
        const { service, scorm } = servicio();
        scorm.assertPlayAccess.mockImplementation(async (pedido: { idSesion: number }) => {
            if (pedido.idSesion !== 1) throw new UnauthorizedException('La sesión del curso expiró. Vuelve a abrirlo desde la app.');
        });
        const token = sign({ ...claims, idSesion: 2 }, SECRETO, { audience: 'scorm-play', expiresIn: '1h' });
        const res = { sendFile: jest.fn() };

        await expect(service.archivo(token, 'index.html', res as any)).rejects.toBeInstanceOf(UnauthorizedException);
        expect(scorm.sendSessionFile).not.toHaveBeenCalled();
        expect(scorm.assertPlayAccess).toHaveBeenCalledWith(expect.objectContaining({ idSesion: 2, idParticipante: 5 }));
    });

    it('un token válido pide el archivo de su sesión y el HTML trae el estado', async () => {
        const { service, scorm, user } = servicio();
        const respuesta = await service.crear(7, 1, user as any);
        const token = respuesta.urlLanzador.split('/')[2];
        const res = {};
        await service.archivo(token, 'media/audio.mp3', res as any);
        expect(scorm.sendSessionFile).toHaveBeenCalledWith(7, 1, 4, 'media/audio.mp3', res, 'private, max-age=3600');

        scorm.openForPlay.mockResolvedValue({
            version: 'scorm_12',
            titulo: 'Inducción',
            disponible: true,
            archivoInicio: 'index_lms.html',
            alumno: { id: '9', nombre: 'Pérez, Ana' },
            estado: {
                entrada: 'resume',
                tiempoTotal: null,
                totalIntentos: 1,
                valores: { 'cmi.suspend_data': '</script><script>alert(1)</script>' },
            },
        });
        const html = await service.html(token);
        expect(html).not.toContain('</script><script>');
        expect(html).toContain('files/index_lms.html');
    });
});
