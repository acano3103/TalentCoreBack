import { Controller, Get, HttpStatus, Param, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from 'src/prisma/prisma.service';
import { errorComms } from '../comms-http';
import { dispositionInline, nombreDeDescarga } from './archivo-publico';
import { ArchivoLeido, CommsStorageService } from './comms-storage.service';

@ApiTags('Comunicación interna')
@Controller('public/comms/files')
export class CommsFilesController {
    constructor(
        private readonly storage: CommsStorageService,
        private readonly prisma: PrismaService,
    ) {}

    @Get(':firma')
    @ApiOperation({
        summary: 'Abrir un archivo firmado',
        description:
            'La firma incluye la ruta y la expiración. No requiere sesión. Content-Disposition trae el nombre visible en filename*=UTF-8.',
    })
    @ApiResponse({ status: 200, description: 'Archivo, con el nombre visible en Content-Disposition.' })
    @ApiResponse({ status: 404, description: 'ENLACE_INVALIDO.' })
    @ApiResponse({ status: 410, description: 'ENLACE_EXPIRADO.' })
    async abrir(@Param('firma') firma: string): Promise<StreamableFile> {
        const archivo = await this.storage.abrirFirmado(decodeURIComponent(firma));
        if (archivo === 'expirada') {
            throw errorComms(HttpStatus.GONE, 'ENLACE_EXPIRADO', 'El enlace del archivo venció. Ábrelo de nuevo desde el comunicado.');
        }
        if (archivo === 'invalida') {
            throw errorComms(HttpStatus.NOT_FOUND, 'ENLACE_INVALIDO', 'El archivo no está disponible.');
        }
        const visible = await this.nombreVisibleDe(archivo);
        return new StreamableFile(archivo.buffer, {
            type: archivo.mime,
            disposition: dispositionInline(visible),
            length: archivo.buffer.length,
        });
    }

    private async nombreVisibleDe(archivo: ArchivoLeido): Promise<string> {
        const adjunto = await this.prisma.comComunicadoAdjuntos.findFirst({
            where: { Ruta: archivo.ruta },
            select: { Nombre: true },
        });
        return nombreDeDescarga(archivo.nombre, adjunto?.Nombre);
    }
}
