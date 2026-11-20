import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync, statSync } from 'fs';
import { resolve, join, extname, relative, sep } from 'path';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MediaService {
    private readonly ALLOWED_ROOT: string;
    private readonly SEARCH_ROOTS: string[];
    private readonly logger = new Logger(MediaService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        const mediaRootPath = this.configService.get<string>('MEDIA_ROOT_PATH');
        const fallbackRoot = resolve(join(process.cwd(), 'media'));

        this.ALLOWED_ROOT = resolve(mediaRootPath || fallbackRoot);

        // 1) Variable de entorno (prioridad)  2) carpeta media en la raíz del proyecto
        this.SEARCH_ROOTS = Array.from(new Set([this.ALLOWED_ROOT, fallbackRoot]));
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
        const asistencia = /^(?:media\/)?([^/]+)\/attendance\/(?:kiosk\/)?(\d+)\//.exec(normalizado);
        if (asistencia) {
            await this.exigirEvidenciaAsistencia(asistencia[1], Number(asistencia[2]), user);
        }

        const segmentoKiosco = normalizado.includes('/attendance/kiosk/') ? 'kiosk/' : '';
        const esperado = asistencia
            ? `${asistencia[1]}/attendance/${segmentoKiosco}${asistencia[2]}/`
            : null;

        const safePath = this.buscarArchivo(fileRelativePath, esperado);
        if (!safePath) {
            throw new NotFoundException('El recurso solicitado no fue encontrado.');
        }

        // Estadísticas físicas del archivo
        const fileStat = statSync(safePath);
        const contentType = this.getMimeType(safePath);
        const fileName = safePath.split(/[\/\\]/).pop();

        // Cabeceras estándar para streaming de archivos binarios seguros
        res.set({
            'Content-Type': contentType,
            'Content-Length': fileStat.size,
            'Content-Disposition': `inline; filename="${fileName}"`,
            'Accept-Ranges': 'bytes', // Permite scroll rápido y navegación por páginas en PDFs largos
            'Cache-Control': 'no-store, no-cache, must-revalidate, private', // Evita fugas de caché
        });

        return new StreamableFile(createReadStream(safePath));
    }

    /**
     * Busca el archivo en cada raíz permitida, en orden.
     * Devuelve la ruta absoluta del primero que exista, o null si no está en ninguna.
     */
    private buscarArchivo(fileRelativePath: string, prefijoEsperado: string | null): string | null {
        for (const root of this.SEARCH_ROOTS) {
            const safePath = resolve(join(root, fileRelativePath));

            // Protección contra Path Traversal (con separador, para evitar /media vs /media-otro)
            if (safePath !== root && !safePath.startsWith(root + sep)) {
                throw new ForbiddenException('Acceso denegado.');
            }

            // Validación de evidencia de asistencia, relativa a esta raíz
            if (prefijoEsperado) {
                const relativo = relative(root, safePath).replace(/\\/g, '/');
                if (!relativo.startsWith(prefijoEsperado)) {
                    continue;
                }
            }

            if (existsSync(safePath) && statSync(safePath).isFile()) {
                if (root !== this.ALLOWED_ROOT) {
                    this.logger.warn(`Archivo servido desde la carpeta de respaldo: ${safePath}`);
                }
                return safePath;
            }
        }
        return null;
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

    private async exigirEvidenciaAsistencia(
        slug: string,
        idEmpresa: number,
        user?: ActiveUserDto,
    ): Promise<void> {
        if (!user?.idTenant || !slug || !Number.isInteger(idEmpresa)) {
            throw new NotFoundException('El recurso solicitado no fue encontrado.');
        }

        const tenant = await this.prisma.catTenants.findUnique({
            where: { idTenant: user.idTenant },
            select: { slug: true },
        });
        if (tenant?.slug !== slug) {
            throw new NotFoundException('El recurso solicitado no fue encontrado.');
        }

        await this.exigirEmpresaDelTenant(idEmpresa, user);
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