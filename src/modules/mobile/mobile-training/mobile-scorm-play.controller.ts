import { Controller, Get, Param, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { htmlSesionExpirada } from './scorm/launcher.template';
import { MobileScormPlayService } from './scorm/mobile-scorm-play.service';

const HTML = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
};

// El WebView no puede mandar Authorization en cada archivo del paquete. El token va en la ruta.
@ApiTags('Mobile Training')
@Controller('mobile/scorm-play')
export class MobileScormPlayController {
    constructor(private readonly play: MobileScormPlayService) {}

    @Get(':token/index.html')
    @ApiOperation({
        summary: 'Launcher SCORM de la app',
        description:
            'HTML del mismo origen que publica window.API y window.API_1484_11 y carga el paquete en un iframe. No usa el JWT móvil. El token vencido responde 401 en HTML.',
    })
    @ApiResponse({ status: 200, description: 'text/html del launcher. Cache-Control: no-store.' })
    @ApiResponse({ status: 401, description: 'Token inválido o vencido.' })
    async index(@Param('token') token: string, @Res() res: Response) {
        try {
            const html = await this.play.html(token);
            res.status(200).set(HTML).send(html);
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                this.expirada(res);
                return;
            }
            throw error;
        }
    }

    @Get(':token/files/*path')
    @ApiOperation({
        summary: 'Archivo del paquete SCORM lanzado desde la app',
        description: 'Sirve un archivo de la sesión del token. Acepta Range para el audio y video de Captivate. Cache-Control: private, max-age=3600.',
    })
    @ApiResponse({ status: 200, description: 'Archivo del paquete. 206 si el cliente pidió Range.' })
    @ApiResponse({ status: 401, description: 'Token inválido, vencido o de otra sesión.' })
    @ApiResponse({ status: 404, description: 'Archivo no encontrado o ruta fuera del paquete.' })
    async archivo(@Param('token') token: string, @Param('path') path: string | string[], @Res() res: Response) {
        const filePath = Array.isArray(path) ? path.join('/') : path;
        try {
            await this.play.archivo(token, filePath, res);
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                this.expirada(res);
                return;
            }
            throw error;
        }
    }

    private expirada(res: Response) {
        res.status(401).set(HTML).send(htmlSesionExpirada());
    }
}
