import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs-extra';
import { randomUUID } from 'crypto';

export interface SaveFileOptions {
    idTenant: number;

    /**
     * Ruta relativa dentro de la carpeta del tenant.
     * Admite carpetas anidadas: "empresas/15/logos".
     */
    subfolder: string;

    /** Nombre del archivo guardado. Si se omite, se genera uno único. */
    fileName?: string;

    /** Si es true, conserva la extensión del archivo original. */
    preserveExtension?: boolean;
}

export interface SavedFile {
    nombreOriginal: string;
    nombreAlmacenado: string;
    rutaRelativa: string;
    rutaAbsoluta: string;
    mimeType: string | null;
    tamanoBytes: number;
}

@Injectable()
export class MediaPathService {
    constructor(private readonly prisma: PrismaService) { }

    private getMediaRoot(): string {
        return path.resolve(
            process.env.MEDIA_ROOT_PATH ||
            path.resolve(process.cwd(), 'media'),
        );
    }

    /**
     * Resuelve y garantiza la ruta física de una subcarpeta para un tenant específico.
     * Ejemplo: getTenantPath(mediaRoot, 3, 'expedientes') -> {mediaRoot}/data-voice-digital/expedientes
     * Crea la carpeta del tenant y la subcarpeta si no existen.
     */
    async getTenantPath(mediaRoot: string, idTenant: number, subfolder: string): Promise<string> {
        const tenant = await this.prisma.catTenants.findUnique({
            where: { idTenant },
            select: { slug: true },
        });

        if (!tenant) {
            throw new InternalServerErrorException(`No se encontró el tenant con id ${idTenant}.`);
        }

        const rutaCompleta = path.join(mediaRoot, tenant.slug, subfolder);
        await fs.ensureDir(rutaCompleta);

        return rutaCompleta;
    }

    async saveFile(
        file: Express.Multer.File,
        options: SaveFileOptions,
    ): Promise<SavedFile> {
        if (!file?.buffer || !file.originalname) {
            throw new BadRequestException(
                'No se recibió un archivo válido.',
            );
        }

        if (!Number.isInteger(options.idTenant) || options.idTenant < 1) {
            throw new BadRequestException('El tenant no es válido.');
        }

        if (
            !options.subfolder ||
            path.isAbsolute(options.subfolder) ||
            options.subfolder.split(/[\\/]+/).includes('..')
        ) {
            throw new BadRequestException(
                'La carpeta de destino no es válida.',
            );
        }

        const baseMediaFolder = this.getMediaRoot();

        const absoluteFolder = await this.getTenantPath(
            baseMediaFolder,
            options.idTenant,
            options.subfolder,
        );

        const originalName = path
            .basename(file.originalname.replace(/\\/g, '/'))
            .slice(0, 255);

        const originalExtension = path
            .extname(originalName)
            .toLowerCase()
            .replace(/[^.a-z0-9]/g, '');

        let nombreAlmacenado: string;

        if (options.fileName) {
            // Se permite un nombre definido por el sistema, nunca una ruta.
            if (
                path.basename(options.fileName) !== options.fileName ||
                options.fileName.includes('..') ||
                /[\\/]/.test(options.fileName)
            ) {
                throw new BadRequestException(
                    'El nombre de archivo no es válido.',
                );
            }

            nombreAlmacenado = options.fileName;
        } else {
            const extension = options.preserveExtension === false
                ? ''
                : originalExtension;

            nombreAlmacenado = `${randomUUID()}${extension}`;
        }

        const absolutePath = path.resolve(
            absoluteFolder,
            nombreAlmacenado,
        );

        const relativeToRoot = path.relative(
            baseMediaFolder,
            absolutePath,
        );

        if (
            relativeToRoot === '..' ||
            relativeToRoot.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativeToRoot)
        ) {
            throw new BadRequestException(
                'La ruta del archivo no es válida.',
            );
        }

        await fs.writeFile(absolutePath, file.buffer, {
            flag: 'wx',
        });

        return {
            nombreOriginal: originalName,
            nombreAlmacenado,
            rutaRelativa: `/media/${relativeToRoot
                .split(path.sep)
                .join('/')}`,
            rutaAbsoluta: absolutePath,
            mimeType: file.mimetype || null,
            tamanoBytes: file.size,
        };
    }

    async deleteFile(rutaRelativa: string): Promise<void> {
        if (
            !rutaRelativa ||
            path.isAbsolute(rutaRelativa) ||
            rutaRelativa.split(/[\\/]+/).includes('..')
        ) {
            throw new BadRequestException(
                'La ruta del archivo no es válida.',
            );
        }

        const root = this.getMediaRoot();
        const absolutePath = path.resolve(root, rutaRelativa);
        const relative = path.relative(root, absolutePath);

        if (
            !relative ||
            relative === '..' ||
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)
        ) {
            throw new BadRequestException(
                'No se permite eliminar archivos fuera de la carpeta de medios.',
            );
        }

        await fs.remove(absolutePath);
    }


}