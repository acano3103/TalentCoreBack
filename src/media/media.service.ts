import { Injectable, NotFoundException, ForbiddenException, BadRequestException, StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync, statSync } from 'fs';
import { resolve, join, extname, relative } from 'path';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MediaService {
    private readonly ALLOWED_ROOT: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        const mediaRootPath = this.configService.get<string>('MEDIA_ROOT_PATH');
        this.ALLOWED_ROOT = resolve(mediaRootPath || join(process.cwd(), 'media'));
    }

    async getPrivateFileGeneric(
        fileRelativePath: string,
        res: Response,
        user?: ActiveUserDto,
    ): Promise<StreamableFile> {
        if (!fileRelativePath) {
            throw new BadRequestException('No se especificó la ruta del archivo.');
        }

        const normalizado = fileRelativePath.replace(/\\/g, '/');
        const kiosco = /^(?:media\/)?attendance\/kiosk\/(\d+)\//.exec(normalizado);
        if (kiosco) {
            await this.exigirEmpresaDelTenant(Number(kiosco[1]), user);
        }

        const safePath = resolve(join(this.ALLOWED_ROOT, fileRelativePath));

        if (!safePath.startsWith(this.ALLOWED_ROOT)) {
            throw new ForbiddenException('Acceso denegado.');
        }

        if (kiosco) {
            const relativo = relative(this.ALLOWED_ROOT, safePath).replace(/\\/g, '/');
            const esperado = `attendance/kiosk/${kiosco[1]}/`;
            if (!relativo.startsWith(esperado)) {
                throw new NotFoundException('El recurso solicitado no fue encontrado.');
            }
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
            'Content-Length': fileStat.size, 
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

    private async exigirEmpresaDelTenant(idEmpresa: number, user?: ActiveUserDto): Promise<void> {
        if (!user?.idTenant || !Number.isInteger(idEmpresa)) {
            throw new NotFoundException('El recurso solicitado no fue encontrado.');
        }
        const empresa = await this.prisma.catEmpresas.findFirst({
            where: { idEmpresa, idTenant: user.idTenant },
            select: { idEmpresa: true },
        });
        if (!empresa) {
            throw new NotFoundException('El recurso solicitado no fue encontrado.');
        }
    }
}