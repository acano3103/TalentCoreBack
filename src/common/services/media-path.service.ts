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

    getMediaRootPath(): string {
        return this.getMediaRoot();
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
            throw new BadRequestException('No se recibió un archivo válido.');
        }

        if (!Number.isInteger(options.idTenant) || options.idTenant < 1) {
            throw new BadRequestException('El tenant no es válido.');
        }

        if (
            !options.subfolder ||
            path.isAbsolute(options.subfolder) ||
            options.subfolder.split(/[\\/]+/).includes('..')
        ) {
            throw new BadRequestException('La carpeta de destino no es válida.');
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
            throw new BadRequestException('La ruta del archivo no es válida.');
        }

        await fs.writeFile(absolutePath, file.buffer, { flag: 'wx' });

        return {
            nombreOriginal: originalName,
            nombreAlmacenado,
            rutaRelativa: `/media/${relativeToRoot.split(path.sep).join('/')}`,
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
            throw new BadRequestException('La ruta del archivo no es válida.');
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
            throw new BadRequestException('No se permite eliminar archivos fuera de la carpeta de medios.');
        }

        await fs.remove(absolutePath);
    }


    /**
     * Resuelve la ruta absoluta de un archivo almacenado en media.
     * Evita que se pueda acceder a archivos fuera de MEDIA_ROOT_PATH.
     */

    getFilePath(rutaRelativa: string): string {
        if (!rutaRelativa) {
            throw new BadRequestException('La ruta del archivo no es válida.');
        }

        const root = this.getMediaRoot();

        // Normalizar separadores y quitar prefijo /media/
        const normalizedPath = rutaRelativa
            .replace(/\\/g, '/')
            .replace(/^\/+/, '')
            .replace(/^media\//i, '');

        // Evitar rutas con traversal
        if (
            !normalizedPath ||
            normalizedPath.split('/').includes('..') ||
            path.posix.isAbsolute(normalizedPath)
        ) {
            throw new BadRequestException('La ruta del archivo no es válida.');
        }

        const absolutePath = path.resolve(root, normalizedPath);
        const relative = path.relative(root, absolutePath);

        if (
            !relative ||
            relative === '..' ||
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)
        ) {
            throw new BadRequestException(
                'No se permite acceder a archivos fuera de la carpeta de medios.',
            );
        }

        return absolutePath;
    }


    /**
     * Valida que un archivo exista y devuelve su ruta absoluta.
     */
    async fileExists(
        rutaRelativa: string,
        errorMessage = 'El archivo solicitado no existe en el servidor.',
    ): Promise<string> {
        const absolutePath = this.getFilePath(rutaRelativa);

        const exists = await fs.pathExists(absolutePath);

        if (!exists) {
            throw new BadRequestException(errorMessage);
        }

        const stats = await fs.stat(absolutePath);

        if (!stats.isFile()) {
            throw new BadRequestException('La ruta indicada no corresponde a un archivo.');
        }

        return absolutePath;
    }

    async saveGeneratedFile(
        buffer: Buffer,
        options: {
            idTenant: number;
            subfolder: string;
            fileName: string;
            mimeType?: string;
        },
    ): Promise<SavedFile> {
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
            throw new BadRequestException('El contenido del archivo no es válido.');
        }

        if (!Number.isInteger(options.idTenant) || options.idTenant < 1) {
            throw new BadRequestException('El tenant no es válido.');
        }

        if (
            !options.subfolder ||
            path.isAbsolute(options.subfolder) ||
            options.subfolder.split(/[\\/]+/).includes('..')
        ) {
            throw new BadRequestException('La carpeta de destino no es válida.');
        }

        if (
            !options.fileName ||
            path.basename(options.fileName) !== options.fileName ||
            options.fileName.includes('..') ||
            /[\\/]/.test(options.fileName)
        ) {
            throw new BadRequestException('El nombre del archivo no es válido.');
        }

        const root = this.getMediaRoot();

        const absoluteFolder = await this.getTenantPath(
            root,
            options.idTenant,
            options.subfolder,
        );

        const absolutePath = path.resolve(absoluteFolder, options.fileName);

        await fs.writeFile(absolutePath, buffer, { flag: 'wx' });

        const relativePath = path.relative(root, absolutePath)
            .split(path.sep)
            .join('/');

        return {
            nombreOriginal: options.fileName,
            nombreAlmacenado: options.fileName,
            rutaRelativa: `/media/${relativePath}`,
            rutaAbsoluta: absolutePath,
            mimeType: options.mimeType || null,
            tamanoBytes: buffer.length,
        };
    }
}