import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs-extra';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MediaPathService } from 'src/common/services/media-path.service';
import { ActiveUserDto } from '../../auth/dto/active-user.dto';
import { CourseContentService } from '../content/course-content.service';
import { CourseLearningService } from '../learning/course-learning.service';
import { ARCHIVO_MATERIAL_REGEX, CourseMaterial, MATERIAL_TIPOS, MIME_POR_EXTENSION, disposicionInline, materialesSubfolder } from './course-materials.constants';

// Multer entrega el nombre en latin1; lo regresamos a UTF-8 (acentos, ñ)
const nombreUtf8 = (nombre: string) => {
    if (/[^\u0000-\u00ff]/.test(nombre)) return nombre;
    const utf8 = Buffer.from(nombre, 'latin1').toString('utf8');
    return utf8.includes('\uFFFD') ? nombre : utf8;
};

export interface MaterialSubido {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}

// Material de apoyo de las lecciones (PDF, documentos, imágenes y video)
@Injectable()
export class CourseMaterialsService {
    private readonly logger = new Logger(CourseMaterialsService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly mediaPathService: MediaPathService,
        private readonly courseContentService: CourseContentService,
        private readonly courseLearningService: CourseLearningService,
    ) { }

    async upload(companyId: number, sessionId: number, archivo: MaterialSubido | undefined, user: ActiveUserDto): Promise<CourseMaterial> {
        const idTenant = this.courseContentService.getTenantOrThrow(user);
        await this.courseContentService.getAsyncSession(companyId, sessionId, idTenant);

        if (!archivo?.buffer?.length) throw new BadRequestException('Selecciona un archivo.');
        const nombre = path.basename(nombreUtf8(archivo.originalname).replace(/\\/g, '/')).slice(0, 255);
        const extension = path.extname(nombre).toLowerCase();
        const tipo = MATERIAL_TIPOS[extension];
        if (!tipo) {
            throw new BadRequestException('Formato no permitido. Usa PDF, Word, PowerPoint, Excel, imagen (PNG, JPG, WEBP) o video (MP4, WEBM).');
        }
        if (archivo.size > tipo.maxBytes) {
            throw new BadRequestException(`El archivo supera el máximo de ${Math.round(tipo.maxBytes / 1024 / 1024)} MB para este formato.`);
        }
        if (!tipo.firma(archivo.buffer)) {
            throw new BadRequestException('El contenido del archivo no corresponde a su extensión.');
        }

        const guardado = await this.mediaPathService.saveFile(archivo as Express.Multer.File, {
            idTenant,
            subfolder: materialesSubfolder(sessionId),
            fileName: `${randomUUID()}${extension}`,
        });

        this.logger.log(`Material ${guardado.nombreAlmacenado} subido a la sesión #${sessionId} por ${user.first_name} ${user.last_name}`);
        return {
            id: randomUUID(),
            tipo: 'archivo',
            nombre,
            archivo: guardado.nombreAlmacenado,
            formato: tipo.formato,
            tamano: archivo.size,
        };
    }

    // Vista previa del administrador (incluye archivos aún no guardados en el contenido)
    async sendForAdmin(companyId: number, sessionId: number, archivo: string, user: ActiveUserDto, res: Response) {
        const idTenant = this.courseContentService.getTenantOrThrow(user);
        await this.courseContentService.getAsyncSession(companyId, sessionId, idTenant);
        await this.send(idTenant, sessionId, archivo, res);
    }

    // Empleado: solo si está inscrito y el archivo pertenece a una lección del curso
    async sendForEmployee(companyId: number, sessionId: number, archivo: string, user: ActiveUserDto, res: Response) {
        const { idTenant } = await this.materialDelEmpleado(companyId, sessionId, archivo, user);
        await this.send(idTenant, sessionId, archivo, res);
    }

    // Misma validación que la web, con Content-Type y filename* para el visor de la app
    async sendForMobileEmployee(companyId: number, sessionId: number, archivo: string, user: ActiveUserDto, res: Response) {
        const { idTenant, nombre } = await this.materialDelEmpleado(companyId, sessionId, archivo, user);
        const extension = path.extname(archivo).toLowerCase();
        await this.send(idTenant, sessionId, archivo, res, {
            'Content-Type': MIME_POR_EXTENSION[extension] ?? 'application/octet-stream',
            'Content-Disposition': disposicionInline(nombre),
        });
    }

    private async materialDelEmpleado(companyId: number, sessionId: number, archivo: string, user: ActiveUserDto) {
        const { idTenant } = await this.courseLearningService.getParticipation(companyId, sessionId, user);
        const lecciones = await this.prismaService.cursoLecciones.findMany({
            where: { idTenant, CursoModulos: { CursoContenidos: { idSesion: sessionId, activo: true } } },
            select: { materiales: true },
        });
        let nombre: string | null = null;
        for (const leccion of lecciones) {
            if (!Array.isArray(leccion.materiales)) continue;
            const material = (leccion.materiales as unknown as CourseMaterial[]).find((m) => m?.archivo === archivo);
            if (material) {
                nombre = material.nombre || archivo;
                break;
            }
        }
        if (!nombre) throw new NotFoundException('Archivo no encontrado.');
        return { idTenant, nombre };
    }

    private async send(idTenant: number, sessionId: number, archivo: string, res: Response, extra?: Record<string, string>) {
        if (!ARCHIVO_MATERIAL_REGEX.test(archivo)) throw new NotFoundException('Archivo no encontrado.');
        const raiz = path.resolve(process.env.MEDIA_ROOT_PATH || path.resolve(process.cwd(), 'media'));
        const carpeta = await this.mediaPathService.getTenantPath(raiz, idTenant, materialesSubfolder(sessionId));
        const absoluto = path.resolve(carpeta, archivo);
        if (path.dirname(absoluto) !== path.resolve(carpeta) || !(await fs.pathExists(absoluto))) {
            throw new NotFoundException('Archivo no encontrado.');
        }

        const headers = {
            'Cache-Control': 'private, max-age=300',
            'X-Content-Type-Options': 'nosniff',
            ...extra,
        };
        await new Promise<void>((ok, fail) =>
            res.sendFile(absoluto, { dotfiles: 'deny', headers }, (err) => (err ? fail(err) : ok())),
        ).catch((err) => {
            if (!res.headersSent) res.status(404).json({ success: false, statusCode: 404, message: 'Archivo no encontrado.' });
            this.logger.warn(`Error enviando material ${absoluto}: ${err.message}`);
        });
    }
}
