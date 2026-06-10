import { Injectable, NotFoundException, ForbiddenException, BadRequestException, StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync, statSync } from 'fs'; // 1. Importa statSync aquí
import { resolve, join, extname } from 'path';
import { Response } from 'express';

@Injectable()
export class MediaService {
    private readonly ALLOWED_ROOT = resolve(join(process.cwd(), 'media'));

    async getPrivateFileGeneric(fileRelativePath: string, res: Response): Promise<StreamableFile> {
        if (!fileRelativePath) {
            throw new BadRequestException('No se especificó la ruta del archivo.');
        }

        const safePath = resolve(join(this.ALLOWED_ROOT, fileRelativePath));

        if (!safePath.startsWith(this.ALLOWED_ROOT)) {
            throw new ForbiddenException('Acceso denegado.');
        }

        if (!existsSync(safePath)) {
            throw new NotFoundException('El recurso solicitado no fue encontrado.');
        }

        // 2. Calculamos las estadísticas físicas del archivo
        const fileStat = statSync(safePath);
        const contentType = this.getMimeType(safePath);
        const fileName = safePath.split(/[\/\\]/).pop();

        // 3. Cabeceras estándar para streaming de archivos binarios seguros
        res.set({
            'Content-Type': contentType,
            'Content-Length': fileStat.size, // 🚀 CRÍTICO: Indica al navegador cuántos bytes procesar
            'Content-Disposition': `inline; filename="${fileName}"`,
            'Accept-Ranges': 'bytes', // Permite scroll rápido y navegación por páginas en PDFs largos
            'Cache-Control': 'no-store, no-cache, must-revalidate, private', // Evita fugas de caché en local
        });

        const fileStream = createReadStream(safePath);
        return new StreamableFile(fileStream);
    }

    private getMimeType(filePath: string): string {
        const ext = extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
}