import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import * as fs from 'fs-extra';
import * as JSZip from 'jszip';
import { dirname, join, posix, resolve, sep } from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import { MediaPathService } from 'src/common/services/media-path.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CourseContentService } from './course-content.service';
import { CourseLearningService } from './course-learning.service';
import { CourseTrackingService } from './course-tracking.service';
import { CommitScormDto } from './dto/commit-scorm.dto';
import { joinPackagePath, parseScormManifest, ScormVersion } from './utils/scorm-manifest.util';
import { readInteractions, readResult, sanitizeCmi, scormTimeToSeconds, secondsToScormTime } from './utils/scorm-cmi.util';

const CALIFICACION_APROBATORIA_DEFAULT = 70;
const TAMANO_MAXIMO_ZIP = 200 * 1024 * 1024;
const TAMANO_MAXIMO_DESCOMPRIMIDO = 1024 * 1024 * 1024;
const MAXIMO_ARCHIVOS = 10000;
const MAXIMO_DATOS_CMI = 256 * 1024;
const SUBCARPETA_SCORM = 'cursos-scorm';

type ZipFile = Awaited<ReturnType<typeof JSZip.loadAsync>>;

// Nombre de carpeta legible, con el mismo criterio que los logos de empresas: sin acentos ni símbolos y "_" por espacios
function carpetaLegible(texto: string | null | undefined, porDefecto: string) {
    const limpio = (texto ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s_-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .toUpperCase()
        .slice(0, 60);
    return limpio || porDefecto;
}

export interface ArchivoSubido {
    originalname: string;
    size: number;
    buffer: Buffer;
}

// Cursos SCORM (1.2 y 2004): el admin sube el .zip, se descomprime en la carpeta de media del tenant
// y el empleado lo toma en un iframe. El paquete se registra como 1 módulo con 1 lección para reutilizar
// el avance, Mis cursos y el seguimiento de los cursos con IA / nativos.
@Injectable()
export class CourseScormService {
    private readonly logger = new Logger(CourseScormService.name);
    private readonly mediaRoot: string;
    // Carpeta del paquete por sesión, para no consultar la BD en cada archivo que pide el iframe
    private readonly cacheRutas = new Map<string, { ruta: string; expira: number }>();

    constructor(
        private readonly prismaService: PrismaService,
        private readonly mediaPathService: MediaPathService,
        private readonly configService: ConfigService,
        private readonly courseContentService: CourseContentService,
        private readonly courseLearningService: CourseLearningService,
        private readonly trackingService: CourseTrackingService,
    ) {
        this.mediaRoot = resolve(this.configService.get<string>('MEDIA_ROOT_PATH') || join(process.cwd(), 'media'));
    }

    private round2(value: number) {
        return Math.round(value * 100) / 100;
    }

    private toNumber(value: unknown): number | null {
        return value == null ? null : Number(value);
    }

    // ==========================================
    // SUBIR PAQUETE (ADMINISTRACIÓN)
    // ==========================================

    private async extractZip(zip: ZipFile, prefijo: string, destino: string) {
        let total = 0;
        let archivos = 0;
        for (const entry of Object.values(zip.files)) {
            if (entry.dir) continue;
            // JSZip ya limpia los "../" del nombre; si el original los traía, el paquete se rechaza
            const original = ((entry as any).unsafeOriginalName ?? entry.name).replace(/\\/g, '/');
            if (original.split('/').includes('..') || original.startsWith('/')) {
                throw new BadRequestException(`El paquete contiene una ruta no permitida: ${original}`);
            }
            const nombre = entry.name.replace(/\\/g, '/');
            if (prefijo && !nombre.startsWith(prefijo)) continue;
            const relativo = posix.normalize(nombre.slice(prefijo.length));
            // Zip Slip: ningún archivo puede quedar fuera de la carpeta del paquete
            if (!relativo || relativo.startsWith('..') || posix.isAbsolute(relativo) || /^[a-z]:/i.test(relativo)) {
                throw new BadRequestException(`El paquete contiene una ruta no permitida: ${entry.name}`);
            }
            if (++archivos > MAXIMO_ARCHIVOS) {
                throw new BadRequestException(`El paquete tiene más de ${MAXIMO_ARCHIVOS} archivos.`);
            }
            const contenido = await entry.async('nodebuffer');
            total += contenido.length;
            if (total > TAMANO_MAXIMO_DESCOMPRIMIDO) {
                throw new BadRequestException('El paquete descomprimido pesa más de 1 GB.');
            }
            await fs.outputFile(join(destino, ...relativo.split('/')), contenido);
        }
        return archivos;
    }

    async uploadPackage(companyId: number, sessionId: number, file: ArchivoSubido | undefined, user: ActiveUserDto) {
        const idTenant = this.courseContentService.getTenantOrThrow(user);
        const session = await this.courseContentService.getAsyncSession(companyId, sessionId, idTenant);
        const nombreCurso = session.CatCursos?.Descripcion || 'Curso';

        if (!file?.buffer?.length) throw new BadRequestException('Selecciona el archivo .zip del paquete SCORM.');
        if (!file.originalname.toLowerCase().endsWith('.zip')) throw new BadRequestException('El paquete SCORM debe ser un archivo .zip.');
        if (file.size > TAMANO_MAXIMO_ZIP) throw new BadRequestException('El archivo .zip no puede pesar más de 200 MB.');

        const existing = await this.prismaService.cursoContenidos.findFirst({
            where: { idSesion: sessionId, idTenant },
            include: { CursoPaquetesScorm: true },
        });
        if (existing) {
            const avances = await this.prismaService.cursoLeccionProgresos.count({
                where: { idTenant, CursoLecciones: { CursoModulos: { idContenido: existing.idContenido } } },
            });
            if (avances > 0) {
                throw new BadRequestException('No es posible modificar el contenido porque ya hay participantes con avance en este curso.');
            }
        }

        // 1. Leer el zip y el imsmanifest.xml (puede venir en la raíz o dentro de una carpeta)
        let zip: ZipFile;
        try {
            zip = await JSZip.loadAsync(file.buffer);
        } catch {
            throw new BadRequestException('No se pudo abrir el archivo .zip. Verifica que no esté dañado.');
        }
        const manifiestos = Object.values(zip.files)
            .filter((f) => !f.dir && /(^|\/)imsmanifest\.xml$/i.test(f.name.replace(/\\/g, '/')))
            .sort((a, b) => a.name.length - b.name.length);
        if (manifiestos.length === 0) {
            throw new BadRequestException('El .zip no es un paquete SCORM: no contiene imsmanifest.xml.');
        }
        const rutaManifiesto = manifiestos[0].name.replace(/\\/g, '/');
        const prefijo = rutaManifiesto.slice(0, rutaManifiesto.length - 'imsmanifest.xml'.length);

        let manifiesto: ReturnType<typeof parseScormManifest>;
        try {
            manifiesto = parseScormManifest(await manifiestos[0].async('string'));
        } catch (e: any) {
            throw new BadRequestException(`El paquete SCORM no es válido: ${e.message}`);
        }
        const archivoInicioSinQuery = manifiesto.archivoInicio.replace(/[?#].*$/, '');
        if (!zip.file(prefijo + archivoInicioSinQuery)) {
            throw new BadRequestException(`El paquete SCORM no es válido: no existe el archivo de inicio "${archivoInicioSinQuery}".`);
        }

        // 2. Descomprimir en {MEDIA_ROOT_PATH}/{slug del tenant}/cursos-scorm/{id aleatorio}
        // {tenant}/cursos-scorm/{EMPRESA}/{CURSO}/sesion-{id}_{código}: ordenado por empresa y curso como los expedientes.
        // El código corto evita que la ruta se pueda adivinar (media se publica en /media) y que un reemplazo pise al anterior.
        const empresa = await this.prismaService.catEmpresas.findFirst({
            where: { idEmpresa: companyId },
            select: { nombre_comercial: true },
        });
        const carpeta = join(
            SUBCARPETA_SCORM,
            carpetaLegible(empresa?.nombre_comercial, `EMPRESA_${companyId}`),
            carpetaLegible(nombreCurso, `CURSO_${session.idCurso}`),
            `sesion-${sessionId}_${randomBytes(4).toString('hex')}`,
        );
        const destino = await this.mediaPathService.getTenantPath(this.mediaRoot, idTenant, carpeta);
        const rutaArchivo = posix.join(...destino.slice(this.mediaRoot.length).split(sep).filter(Boolean));

        try {
            const totalArchivos = await this.extractZip(zip, prefijo, destino);
            const anterior = existing?.CursoPaquetesScorm?.rutaArchivo ?? null;

            // 3. Registrar contenido, 1 módulo con 1 lección y el paquete
            const idContenido = await this.prismaService.$transaction(async (tx) => {
                const estructura = {
                    title: manifiesto.titulo,
                    description: '',
                    targetAudience: '',
                    level: '',
                    scorm: { version: manifiesto.version, archivo: file.originalname, totalArchivos },
                };
                const contenido = existing
                    ? await tx.cursoContenidos.update({
                        where: { idContenido: existing.idContenido },
                        data: { tipoContenido: 'scorm', modoAvance: 'libre', estatusVideo: 'no_aplica', estructuraIa: estructura, actualizadoEn: new Date() },
                    })
                    : await tx.cursoContenidos.create({
                        data: {
                            idTenant,
                            idEmpresa: companyId,
                            idSesion: sessionId,
                            tipoContenido: 'scorm',
                            modoAvance: 'libre',
                            estatusVideo: 'no_aplica',
                            estructuraIa: estructura,
                        },
                    });

                await tx.cursoModulos.deleteMany({ where: { idContenido: contenido.idContenido } });
                await tx.cursoModulos.create({
                    data: {
                        idTenant,
                        idContenido: contenido.idContenido,
                        titulo: manifiesto.titulo,
                        orden: 0,
                        CursoLecciones: {
                            create: [{ idTenant, titulo: manifiesto.titulo, slides: [], quiz: [], estatusVideo: 'no_aplica', orden: 0 }],
                        },
                    },
                });

                const paquete = {
                    version: manifiesto.version,
                    archivoInicio: manifiesto.archivoInicio.slice(0, 500),
                    rutaArchivo,
                    nombreArchivo: file.originalname.slice(0, 255),
                };
                await tx.cursoPaquetesScorm.upsert({
                    where: { idContenido: contenido.idContenido },
                    create: { idTenant, idContenido: contenido.idContenido, ...paquete },
                    update: paquete,
                });

                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario: user.id,
                        idEmpresa: companyId,
                        accion: existing ? 'UPDATE' : 'CREATE',
                        tablaOrigen: 'CursoPaquetesScorm',
                        idRegistro: String(contenido.idContenido),
                        descripcion: `Paquete SCORM "${file.originalname}" ${existing ? 'reemplazado' : 'cargado'} en la sesión #${sessionId} del curso "${nombreCurso}" por ${user.first_name} ${user.last_name}`,
                        fechaCreacion: new Date(),
                    },
                });

                return contenido.idContenido;
            }, { timeout: 20000 });

            this.cacheRutas.delete(`${idTenant}:${sessionId}`);
            if (anterior) await this.removeFolder(anterior);
            this.logger.log(`Paquete SCORM cargado en contenido #${idContenido} (${totalArchivos} archivos, ${manifiesto.version})`);
        } catch (e) {
            await this.removeFolder(posix.join(...destino.slice(this.mediaRoot.length).split(sep).filter(Boolean)));
            throw e;
        }

        const detalle = await this.courseContentService.findContent(companyId, sessionId, user);
        return { message: `Paquete SCORM cargado: ${manifiesto.titulo}`, ...detalle };
    }

    // Borra la carpeta de un paquete y las carpetas de curso / empresa que queden vacías (sin salir de cursos-scorm)
    private async removeFolder(rutaRelativa: string) {
        const carpeta = resolve(this.mediaRoot, rutaRelativa);
        if (!carpeta.startsWith(this.mediaRoot + sep) || !carpeta.includes(`${sep}${SUBCARPETA_SCORM}${sep}`)) return;
        try {
            await fs.remove(carpeta);
            let padre = dirname(carpeta);
            while (!padre.endsWith(`${sep}${SUBCARPETA_SCORM}`) && padre.includes(`${sep}${SUBCARPETA_SCORM}${sep}`)) {
                if ((await fs.readdir(padre)).length > 0) break;
                await fs.rmdir(padre);
                padre = dirname(padre);
            }
        } catch (e: any) {
            this.logger.warn(`No se pudo borrar ${carpeta}: ${e.message}`);
        }
    }

    // ==========================================
    // SERVIR ARCHIVOS DEL PAQUETE (IFRAME)
    // ==========================================

    private async getPackageFolder(companyId: number, sessionId: number, idTenant: number) {
        const key = `${idTenant}:${sessionId}`;
        const cache = this.cacheRutas.get(key);
        if (cache && cache.expira > Date.now()) return cache.ruta;

        await this.courseContentService.getAsyncSession(companyId, sessionId, idTenant);
        const contenido = await this.prismaService.cursoContenidos.findFirst({
            where: { idSesion: sessionId, idTenant, tipoContenido: 'scorm' },
            include: { CursoPaquetesScorm: true },
        });
        if (!contenido?.CursoPaquetesScorm) {
            throw new NotFoundException('La sesión no tiene un paquete SCORM.');
        }
        const ruta = resolve(this.mediaRoot, contenido.CursoPaquetesScorm.rutaArchivo);
        this.cacheRutas.set(key, { ruta, expira: Date.now() + 60_000 });
        return ruta;
    }

    async sendFile(companyId: number, sessionId: number, filePath: string, user: ActiveUserDto, res: Response) {
        const idTenant = this.courseContentService.getTenantOrThrow(user);
        const carpeta = await this.getPackageFolder(companyId, sessionId, idTenant);

        let relativo: string;
        try {
            relativo = joinPackagePath(decodeURIComponent(filePath || ''));
        } catch {
            throw new NotFoundException('Archivo no encontrado.');
        }
        const absoluto = resolve(carpeta, ...relativo.split('/'));
        if (!absoluto.startsWith(carpeta + sep) || !(await fs.pathExists(absoluto))) {
            throw new NotFoundException('Archivo no encontrado.');
        }

        await new Promise<void>((ok, fail) =>
            res.sendFile(absoluto, { dotfiles: 'deny', headers: { 'Cache-Control': 'private, max-age=300' } }, (err) =>
                err ? fail(err) : ok(),
            ),
        ).catch((err) => {
            if (!res.headersSent) res.status(404).json({ success: false, statusCode: 404, message: 'Archivo no encontrado.' });
            this.logger.warn(`Error enviando ${absoluto}: ${err.message}`);
        });
    }

    // ==========================================
    // PLAYER DEL EMPLEADO
    // ==========================================

    private async getScormParticipation(companyId: number, sessionId: number, user: ActiveUserDto) {
        const { participacion, idTenant, idEmpleado } = await this.courseLearningService.getParticipation(companyId, sessionId, user);
        const contenido = await this.prismaService.cursoContenidos.findFirst({
            where: { idSesion: sessionId, idTenant, activo: true },
            include: {
                CursoPaquetesScorm: true,
                CursoModulos: { orderBy: { orden: 'asc' }, include: { CursoLecciones: { orderBy: { orden: 'asc' } } } },
            },
        });
        const leccion = contenido?.CursoModulos[0]?.CursoLecciones[0];
        if (!contenido || contenido.tipoContenido !== 'scorm' || !contenido.CursoPaquetesScorm || !leccion) {
            throw new BadRequestException('El curso no tiene un paquete SCORM.');
        }
        return { participacion, idTenant, idEmpleado, contenido, paquete: contenido.CursoPaquetesScorm, leccion };
    }

    // Datos para lanzar el paquete y retomar donde se quedó
    async getLaunch(companyId: number, sessionId: number, user: ActiveUserDto) {
        const { participacion, idTenant, paquete, leccion } = await this.getScormParticipation(companyId, sessionId, user);
        const { disponible, motivo } = this.courseLearningService.getAvailability(participacion.CursoSesiones);
        const progreso = await this.prismaService.cursoScormProgresos.findUnique({
            where: { idParticipante: participacion.idParticipante },
        });
        const valores = progreso && progreso.idTenant === idTenant ? ((progreso.datosCmi ?? {}) as Record<string, string>) : {};
        const [ruta, ...query] = paquete.archivoInicio.split('?');
        const archivo = ruta.split('/').map(encodeURIComponent).join('/') + (query.length ? `?${query.join('?')}` : '');

        return {
            idLeccion: leccion.idLeccion,
            titulo: leccion.titulo,
            version: paquete.version as ScormVersion,
            urlInicio: `companies/${companyId}/courses/sessions/${sessionId}/scorm/files/${archivo}`,
            disponible,
            motivoNoDisponible: motivo,
            alumno: { id: String(participacion.idEmpleado), nombre: `${user.last_name}, ${user.first_name}` },
            estado: {
                entrada: Object.keys(valores).length > 0 ? 'resume' : 'ab-initio',
                tiempoTotal: progreso?.tiempoTotal ?? null,
                totalIntentos: progreso?.totalIntentos ?? 0,
                valores,
            },
        };
    }

    // El paquete guarda su avance (LMSCommit / Commit) y al cerrar (LMSFinish / Terminate) manda terminado = true
    async commit(companyId: number, sessionId: number, dto: CommitScormDto, user: ActiveUserDto) {
        const { participacion, idTenant, paquete, leccion } = await this.getScormParticipation(companyId, sessionId, user);
        const sesion = participacion.CursoSesiones;
        const { disponible, motivo } = this.courseLearningService.getAvailability(sesion);
        if (!disponible) return { guardado: false, motivo };

        const version = paquete.version as ScormVersion;
        const aprobatoria = sesion.CatCursos?.calificacionAprobatoria ?? CALIFICACION_APROBATORIA_DEFAULT;
        const nuevos = sanitizeCmi(dto.valores);
        const ahora = new Date();
        const participante = { idTenant, idParticipante: participacion.idParticipante };

        const anterior = await this.prismaService.cursoScormProgresos.findUnique({
            where: { idParticipante: participacion.idParticipante },
        });
        // El tiempo de sesión solo vale para esta sesión: se suma al total al cerrar y no se guarda
        const tiempoSesion = nuevos['cmi.core.session_time'] ?? nuevos['cmi.session_time'] ?? null;
        const valores = { ...((anterior?.datosCmi ?? {}) as Record<string, string>), ...nuevos };
        delete valores['cmi.core.session_time'];
        delete valores['cmi.session_time'];
        if (Buffer.byteLength(JSON.stringify(valores)) > MAXIMO_DATOS_CMI) {
            throw new BadRequestException('El paquete intentó guardar demasiada información.');
        }
        const resultado = readResult(version, valores);

        // Al cerrar se suma el tiempo de la sesión al tiempo total (como lo pide SCORM)
        let tiempoTotal = anterior?.tiempoTotal ?? null;
        if (dto.terminado) {
            const segundos = scormTimeToSeconds(tiempoTotal) + scormTimeToSeconds(tiempoSesion);
            tiempoTotal = secondsToScormTime(version, segundos);
        }

        const resultadoCurso = await this.prismaService.$transaction(async (tx) => {
            await this.trackingService.touchActivity(tx, participante, ahora);

            const datos = {
                estatusLeccion: resultado.estatusLeccion,
                estatusExito: resultado.estatusExito,
                calificacion: resultado.calificacion,
                ubicacion: resultado.ubicacion?.slice(0, 1000) ?? null,
                datosSuspension: resultado.datosSuspension,
                tiempoTotal,
                datosCmi: valores,
                fechaUltimoGuardado: ahora,
            };
            await tx.cursoScormProgresos.upsert({
                where: { idParticipante: participacion.idParticipante },
                create: { idTenant, idParticipante: participacion.idParticipante, idPaqueteScorm: paquete.idPaqueteScorm, totalIntentos: dto.terminado ? 1 : 0, ...datos },
                update: { ...datos, actualizadoEn: ahora, ...(dto.terminado ? { totalIntentos: { increment: 1 } } : {}) },
            });

            const progresoLeccion = await tx.cursoLeccionProgresos.findUnique({
                where: { idParticipante_idLeccion: { idParticipante: participacion.idParticipante, idLeccion: leccion.idLeccion } },
            });
            const calificacionAnterior = this.toNumber(progresoLeccion?.calificacionQuiz);
            const yaCompletada = !!progresoLeccion?.fechaCompletado;

            // Seguimiento: cada cierre con resultado cuenta como un intento (para reprobados, mejoras y primer intento).
            // Solo cuenta lo que el paquete reportó en esta sesión (repasar un curso ya terminado no suma intentos).
            // Muchos paquetes (Captivate) mandan "incomplete" con calificación 0 al abrir: eso no es un intento.
            const resultadoSesion = readResult(version, nuevos);
            const esIntento =
                resultadoSesion.aprobado != null ||
                (resultadoSesion.completado && resultadoSesion.calificacion != null) ||
                (resultadoSesion.calificacion != null && resultadoSesion.calificacion > 0);
            if (dto.terminado && esIntento) {
                const calificacionIntento = resultadoSesion.calificacion ?? (resultadoSesion.aprobado ? 100 : 0);
                // Preguntas del quiz del paquete (si las reporta): qué contestó y si fue correcta
                const preguntas = readInteractions(dto.valores);
                await this.trackingService.recordQuizAttempt(tx, participante, {
                    idLeccion: leccion.idLeccion,
                    calificacion: calificacionIntento,
                    aprobado: resultadoSesion.aprobado ?? calificacionIntento >= aprobatoria,
                    respuestas: preguntas,
                    totalPreguntas: preguntas.length,
                    respuestasCorrectas: preguntas.filter((p) => p.correcta).length,
                    yaAprobadaAntes: participacion.estatusAsignacion === 'completado',
                    ahora,
                });
            }

            if (!resultado.completado && !yaCompletada) {
                return { terminado: false, estatusAsignacion: participacion.estatusAsignacion, calificacionFinal: this.toNumber(participacion.calificacionFinal) };
            }

            // Se conserva la mejor calificación que haya reportado el paquete
            const mejor =
                resultado.calificacion == null ? calificacionAnterior : Math.max(resultado.calificacion, calificacionAnterior ?? 0);
            await tx.cursoLeccionProgresos.upsert({
                where: { idParticipante_idLeccion: { idParticipante: participacion.idParticipante, idLeccion: leccion.idLeccion } },
                create: { idTenant, idParticipante: participacion.idParticipante, idLeccion: leccion.idLeccion, calificacionQuiz: mejor, fechaCompletado: ahora },
                update: { calificacionQuiz: mejor, fechaCompletado: progresoLeccion?.fechaCompletado ?? ahora, actualizadoEn: ahora },
            });
            if (!yaCompletada) {
                await this.trackingService.logEvent(tx, participante, 'completar_leccion', ahora, leccion.idLeccion, {
                    calificacion: mejor,
                    estatus: resultado.estatusExito ?? resultado.estatusLeccion,
                });
            }

            // Estatus final: si alguna vez aprobó se queda aprobado; si el paquete dice "failed" es reprobado;
            // si no reporta aprobado/reprobado se compara la calificación contra la mínima del curso.
            const calificacionFinal = mejor ?? (resultado.aprobado === false ? 0 : 100);
            const estatusAsignacion =
                participacion.estatusAsignacion === 'completado' || resultado.aprobado === true
                    ? 'completado'
                    : resultado.aprobado === false
                        ? 'reprobado'
                        : calificacionFinal >= aprobatoria
                            ? 'completado'
                            : 'reprobado';

            const calificacionPrevia = this.toNumber(participacion.calificacionFinal);
            if (calificacionFinal !== calificacionPrevia || estatusAsignacion !== participacion.estatusAsignacion) {
                await tx.cursoParticipantes.update({
                    where: { idParticipante: participacion.idParticipante },
                    data: { calificacionFinal: this.round2(calificacionFinal), estatusAsignacion },
                });
                if (estatusAsignacion !== participacion.estatusAsignacion) {
                    await tx.historicoMovimientos.create({
                        data: {
                            idUsuario: user.id,
                            idEmpresa: companyId,
                            accion: 'UPDATE',
                            tablaOrigen: 'CursoParticipantes',
                            idRegistro: String(participacion.idParticipante),
                            descripcion: `${user.first_name} ${user.last_name} terminó el curso "${sesion.CatCursos?.Descripcion || ''}" (sesión #${sessionId}) con ${calificacionFinal}: ${estatusAsignacion}`,
                            fechaCreacion: ahora,
                        },
                    });
                }
            }

            await this.trackingService.registerCourseEnd(tx, participante, ahora, { calificacionFinal, estatusAsignacion });
            return { terminado: true, estatusAsignacion, calificacionFinal };
        }, { timeout: 15000 });

        return {
            guardado: true,
            completado: resultado.completado,
            aprobado: resultado.aprobado,
            calificacion: resultado.calificacion,
            curso: resultadoCurso,
        };
    }
}
