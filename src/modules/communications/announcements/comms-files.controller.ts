import { Controller, Get, HttpStatus, Param, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errorComms } from '../comms-http';
import { CommsStorageService } from './comms-storage.service';

@ApiTags('Comunicación interna')
@Controller('public/comms/files')
export class CommsFilesController {
    constructor(private readonly storage: CommsStorageService) {}

    @Get(':firma')
    @ApiOperation({
        summary: 'Abrir un archivo firmado',
        description: 'La firma incluye la ruta y la expiración. No requiere sesión.',
    })
    @ApiResponse({ status: 200, description: 'Archivo.' })
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
        const nombre = archivo.nombre.replace(/["\r\n]/g, '');
        return new StreamableFile(archivo.buffer, {
            type: archivo.mime,
            disposition: `inline; filename="${nombre}"`,
            length: archivo.buffer.length,
        });
    }
}
