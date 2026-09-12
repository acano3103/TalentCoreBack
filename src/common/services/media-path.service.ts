import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs-extra';

@Injectable()
export class MediaPathService {
    constructor(private readonly prisma: PrismaService) { }

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
}