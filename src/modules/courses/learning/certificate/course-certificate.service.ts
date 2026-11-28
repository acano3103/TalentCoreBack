import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import { MediaPathService } from 'src/common/services/media-path.service';
import { ActiveUserDto } from '../../../auth/dto/active-user.dto';
import { buildCertificatePdf, CertificateData } from './course-certificate.pdf';

const ZONA_HORARIA = 'America/Mexico_City';

@Injectable()
export class CourseCertificateService {
    private readonly logger = new Logger(CourseCertificateService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mediaPath: MediaPathService,
    ) { }

    // Constancia del empleado logueado; solo si aprobó el curso
    async getMyCertificate(companyId: number, sessionId: number, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant;

        const empleado = user.uuid
            ? await this.prisma.empleados.findFirst({
                where: { idUsuario: user.uuid, idEmpresa: companyId, idTenant },
                select: { idEmpleado: true, nombre: true, primerApellido: true, segundoApellido: true },
            })
            : null;
        if (!empleado) {
            throw new NotFoundException('El usuario no tiene un empleado asociado en esta empresa.');
        }

        const participante = await this.prisma.cursoParticipantes.findFirst({
            where: { idSesion: sessionId, idEmpleado: empleado.idEmpleado, CursoSesiones: { idEmpresa: companyId } },
            select: {
                idParticipante: true,
                estatusAsignacion: true,
                CursoSesiones: { select: { CatCursos: { select: { Descripcion: true, idTenant: true } } } },
                CursoSeguimientoParticipante: { select: { fechaConclusion: true } },
                CursoLeccionProgresos: {
                    where: { fechaCompletado: { not: null } },
                    select: { fechaCompletado: true },
                    orderBy: { fechaCompletado: 'desc' },
                    take: 1,
                },
            },
        });
        const tenantCurso = participante?.CursoSesiones.CatCursos?.idTenant;
        if (!participante || (tenantCurso != null && tenantCurso !== idTenant)) {
            throw new NotFoundException(`No tienes asignado el curso de la sesión #${sessionId}.`);
        }
        if (participante.estatusAsignacion !== 'completado') {
            throw new BadRequestException('La constancia estará disponible cuando concluyas y apruebes el curso.');
        }

        const empresa = await this.prisma.catEmpresas.findFirst({
            where: { idEmpresa: companyId },
            select: { razon_social: true, nombre_comercial: true, logo_empresa: true, idTenant: true },
        });
        if (!empresa || (empresa.idTenant != null && empresa.idTenant !== idTenant)) {
            throw new NotFoundException('La empresa no existe.');
        }

        const conclusion =
            participante.CursoSeguimientoParticipante?.fechaConclusion ??
            participante.CursoLeccionProgresos[0]?.fechaCompletado ??
            null;
        const ahora = new Date();
        const curso = participante.CursoSesiones.CatCursos?.Descripcion || 'Curso';

        const datos: CertificateData = {
            empresa: empresa.razon_social || empresa.nombre_comercial,
            empleado: [empleado.nombre, empleado.primerApellido, empleado.segundoApellido].filter(Boolean).join(' ').trim(),
            curso,
            folio: `CAP-${(conclusion ?? ahora).getFullYear()}-${String(participante.idParticipante).padStart(6, '0')}`,
            fechaConclusion: conclusion ? this.formatoFecha(conclusion) : null,
            fechaEmision: this.formatoFecha(ahora),
            logo: await this.leerLogo(empresa.logo_empresa),
        };

        try {
            const bytes = await buildCertificatePdf(datos);
            return { buffer: Buffer.from(bytes), fileName: `Constancia-${this.nombreArchivo(curso)}.pdf` };
        } catch (error: any) {
            this.logger.error(`Error al generar la constancia de la sesión ${sessionId}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('No se pudo generar la constancia.');
        }
    }

    // "14 de noviembre de 2026"
    private formatoFecha(fecha: Date) {
        return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA_HORARIA }).format(fecha);
    }

    // Solo PNG o JPG; si falta o falla, la constancia sale sin logo
    private async leerLogo(ruta: string | null): Promise<CertificateData['logo']> {
        if (!ruta) return null;
        const ext = path.extname(ruta).toLowerCase();
        const tipo = ext === '.png' ? 'png' : ext === '.jpg' || ext === '.jpeg' ? 'jpg' : null;
        if (!tipo) return null;
        try {
            const absoluta = await this.mediaPath.fileExists(ruta);
            return { bytes: await fs.readFile(absoluta), tipo };
        } catch {
            return null;
        }
    }

    private nombreArchivo(texto: string) {
        return texto
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'curso';
    }
}
