
import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import { access, readFile } from 'fs/promises';
import * as path from 'path';
import { MediaPathService } from 'src/common/services/media-path.service';
import { Response } from 'express';
import { DocumentosTemplatesService } from '../documentos-templates.service';
import { convertDocxToPdf } from 'src/common/utils/libreoffice.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { SaveSignaturePositionDto } from '../dto/save-signature-position.dto';

@Injectable()
export class DocumentPreviewService {
    private readonly logger = new Logger(DocumentPreviewService.name);

    constructor(
        private readonly mediaPathService: MediaPathService,
        private readonly templatesService: DocumentosTemplatesService,
        private readonly prisma: PrismaService
    ) { }

    async generateDocumentPreview(companyId: number, id: number, res: Response) {
        // findOne valida que la plantilla corresponda a la empresa.
        const template = await this.templatesService.findOne(
            companyId,
            id,
        );

        if (!template?.archivoOriginal) {
            // El servicio de previsualización también valida este caso,
            // pero así dejamos explícita la condición del controlador.
            return res.status(404).send({ message: 'La plantilla no tiene un archivo original.' });
        }

        const pdfBuffer = await this.generatePreview(template.archivoOriginal);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="plantilla-${id}-preview.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'private, no-store');

        return res.status(200).send(pdfBuffer);
    }

    async saveSignaturePosition(
        companyId: number,
        documentId: number,
        dto: SaveSignaturePositionDto,
    ) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: {
                id: documentId,
                plantilla: {
                    idEmpresa: companyId,
                },
            },
            select: {
                id: true,
                firmado: true,
            },
        });

        if (!documento) {
            throw new NotFoundException('No se encontró el documento generado.',);
        }

        if (documento.firmado) {
            throw new BadRequestException('No se puede modificar la posición de firma de un documento firmado.',);
        }

        if (dto.x + dto.ancho > 100 || dto.y + dto.alto > 100) {
            throw new BadRequestException('El campo de firma debe permanecer dentro de los límites de la página.',);
        }

        const actualizado = await this.prisma.documentosGenerados.update({
            where: {
                id: documento.id,
            },
            data: {
                firmaConfigurada: true,
                firmaPagina: dto.pagina,
                firmaX: dto.x,
                firmaY: dto.y,
                firmaAncho: dto.ancho,
                firmaAlto: dto.alto,
            },
            select: {
                id: true,
                firmaConfigurada: true,
                firmaPagina: true,
                firmaX: true,
                firmaY: true,
                firmaAncho: true,
                firmaAlto: true,
            },
        });

        return {
            message: 'Posición de firma guardada correctamente.',
            data: actualizado,
        };
    }

    async getSignaturePosition(
        companyId: number,
        documentId: number,
    ) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: {
                id: documentId,
                plantilla: {
                    idEmpresa: companyId,
                },
            },
            select: {
                id: true,
                firmaConfigurada: true,
                firmaPagina: true,
                firmaX: true,
                firmaY: true,
                firmaAncho: true,
                firmaAlto: true,
            },
        });

        if (!documento) {
            throw new NotFoundException(
                'No se encontró el documento generado.',
            );
        }

        return documento;
    }

    /**
     * Convierte un DOCX a PDF o devuelve el PDF original.
     *
     * @param relativePath Ruta relativa guardada en archivoOriginal.
     */
    async generatePreview(relativePath: string): Promise<Buffer> {
        if (!relativePath) {
            throw new NotFoundException('La plantilla no tiene un archivo original asociado.');
        }

        const inputPath = this.mediaPathService.getFilePath(relativePath);
        const extension = path.extname(inputPath).toLowerCase();

        try {
            await access(inputPath);
        } catch {
            throw new NotFoundException('No se encontró el archivo original de la plantilla.');
        }

        // Si el archivo original ya es PDF, no necesitamos convertirlo.
        if (extension === '.pdf') return readFile(inputPath);

        if (extension !== '.docx') {
            throw new BadRequestException('El formato de la plantilla no es compatible. Utiliza DOCX o PDF.');
        }

        return convertDocxToPdf(inputPath);
    }
}
