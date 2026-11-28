import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { MobileScormPlayController } from './mobile-scorm-play.controller';

describe('MobileScormPlayController', () => {
    const play = { html: jest.fn(), archivo: jest.fn() };
    const controller = new MobileScormPlayController(play as any);

    function respuesta() {
        return {
            status: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };
    }

    it('no exige el JWT móvil', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, MobileScormPlayController)).toBeUndefined();
        expect(Reflect.getMetadata(GUARDS_METADATA, MobileScormPlayController)).not.toEqual(expect.arrayContaining([MobileJwtAuthGuard]));
        expect(Reflect.getMetadata(PATH_METADATA, MobileScormPlayController)).toBe('mobile/scorm-play');
        const proto = MobileScormPlayController.prototype;
        expect(Reflect.getMetadata(PATH_METADATA, proto.index)).toBe(':token/index.html');
        expect(Reflect.getMetadata(METHOD_METADATA, proto.index)).toBe(RequestMethod.GET);
        expect(Reflect.getMetadata(PATH_METADATA, proto.archivo)).toBe(':token/files/*path');
        expect(Reflect.getMetadata(METHOD_METADATA, proto.archivo)).toBe(RequestMethod.GET);
    });

    it('el token vencido muestra el mensaje en español', async () => {
        play.html.mockRejectedValue(new UnauthorizedException('x'));
        const res = respuesta();
        await controller.index('vencido', res as any);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.set).toHaveBeenCalledWith({
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        expect(res.send.mock.calls[0][0]).toContain('La sesión del curso expiró. Vuelve a abrirlo desde la app.');
    });

    it('sirve el launcher y deja pasar el 404 de un archivo', async () => {
        play.html.mockResolvedValue('<html lang="es"></html>');
        const res = respuesta();
        await controller.index('token', res as any);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('<html lang="es"></html>');

        play.archivo.mockRejectedValue(new NotFoundException('Archivo no encontrado.'));
        await expect(controller.archivo('token', ['..', 'secreto'], res as any)).rejects.toBeInstanceOf(NotFoundException);
        expect(play.archivo).toHaveBeenCalledWith('token', '../secreto', res);
    });
});
