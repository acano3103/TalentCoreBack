import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { UpdatePostulationStatusDto } from './dto/update-status.dto';
import { generateCredentials } from './services/credentials.service';
import { ALLOWED_STATUS_TRANSITIONS } from './utils/allowed-transitions';
import { userFullInfo } from 'src/common/interfaces/user.interface';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { HttpService } from '@nestjs/axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from 'src/prisma/prisma.service';
import { IntegrationsFactory } from '../integrations/providers/factory.service';
import { CreatePostulationDto } from './dto/create-postulation.dto';
import { PostulationsQueries } from './queries/postulations.queries';
import { calculatePercentage } from '../vacancies/utils/formatters.util';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@Injectable()
export class PostulationsService {
  constructor(
    private prisma: PrismaService,
    private readonly notifications: NotificationDispatcher,
    private readonly httpService: HttpService,
    private readonly integrationFactory: IntegrationsFactory,
  ) { }

  private readonly logger = new Logger(PostulationsService.name);

  // Esta función es pública, crea una postulación desde la bolsa de trabajo, y dispara el perfilador de IA para el análisis de CV
  async createPostulation(companyId: number, data: CreatePostulationDto, file: Express.Multer.File) {
    const { vacante_id, nombre, primerApellido, segundoApellido, correo, telefono, curp, utm_source } = data;

    if (!file) throw new BadRequestException('El archivo CV es obligatorio');

    const alreadyPostulated = await this.prisma.postulaciones.findFirst({
      where: { idVacante: parseInt(vacante_id), curp }
    });
    if (alreadyPostulated) throw new BadRequestException('Ya te has postulado a esta vacante');

    let physicalPathToDelete: string | null = null;

    try {
      // 1. Obtener nombre de la vacante
      const vacante = await this.prisma.vacantes.findFirst({
        where: { idVacante: parseInt(vacante_id), idEmpresa: companyId },
        include: { CatPuestos: true }
      });
      if (!vacante) throw new NotFoundException('Vacante no encontrada');

      const nombrePuestoRaw = vacante?.CatPuestos?.NombrePuesto || `Puesto_${vacante_id}`;
      // Sanitizar nombres eliminando caracteres de control de rutas (.., /, \)
      const cleanNombrePuesto = nombrePuestoRaw.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');
      const cleanNombre = nombre.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');
      const cleanApellido = primerApellido.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');

      const nombrePostulante = `${cleanNombre}_${cleanApellido}`;

      // 2. Rutas Físicas
      const rootPath = path.resolve(process.cwd(), 'media');
      const relativePath = path.join('VACANTES', cleanNombrePuesto, nombrePostulante);
      const targetFolder = path.join(rootPath, relativePath);

      // Validar el prefijo para destruir cualquier intento de Path Traversal
      if (!targetFolder.startsWith(rootPath)) {
        throw new BadRequestException('Path Injection detected and blocked.');
      }

      // Lista blanca de extensiones para el CV (Solo PDF)
      const extension = path.extname(file.originalname).toLowerCase();
      const allowedExtensions = ['.pdf'];
      if (!allowedExtensions.includes(extension)) {
        throw new BadRequestException('Formato de archivo no permitido. Solo se acepta PDF.');
      }

      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      const fileName = `CV_${uuidv4()}${extension}`;
      const physicalPath = path.join(targetFolder, fileName);
      const webPath = `/media/${path.join(relativePath, fileName).replace(/\\/g, '/')}`;

      // Guardamos el archivo y registramos la ruta física por si necesitamos borrarlo en el catch
      fs.writeFileSync(physicalPath, file.buffer);
      physicalPathToDelete = physicalPath;

      // Buscamos si la empresa tiene una integración de IA activa
      const activeAiIntegration = await this.prisma.integraciones.findFirst({
        where: {
          idEmpresa: companyId,
          isConnected: true,
          CatIntegracionesProvedores: {
            type: 'ai',
            isActive: true
          }
        },
        include: {
          CatIntegracionesProvedores: true
        }
      });

      // 3. Transacción secuencial estricta solo para lo que escribe en la BD y depende entre sí
      const [postulation, log] = await this.prisma.$transaction(async (tx) => {
        // Primero registramos la postulación para obtener su ID
        const newPostulation = await tx.postulaciones.create({
          data: {
            idEstatus: 1,
            idVacante: parseInt(vacante_id),
            nombre,
            primerApellido,
            segundoApellido,
            correo,
            telefono,
            curp,
            utmSource: utm_source,
            rutaCV: webPath,
            fechaRegistro: new Date()
          }
        });

        // Registramos el moviemiento en el historico
        const newLog = await tx.historicoMovimientos.create({
          data: {
            idUsuario: 1,
            idEmpresa: companyId,
            accion: 'CREAR',
            tablaOrigen: 'Postulaciones',
            idRegistro: String(newPostulation.idPostulacion),
            descripcion: `Postulación registrada a la vacante ${vacante.CatPuestos?.NombrePuesto}`,
            fechaCreacion: new Date()
          }
        });

        return [newPostulation, newLog];
      });

      // Si la empresa no tiene la IA configurada, forzamos un error para disparar el catch y borrar el CV recién subido
      if (!activeAiIntegration) {
        throw new BadRequestException('La empresa no cuenta con una integración de Inteligencia Artificial activa.');
      }

      // 4. DISPARO ASÍNCRONO (Background Job)
      const providerId = activeAiIntegration.providerId;
      this.integrationFactory.getProvider(providerId).then((aiProvider) => {
        return aiProvider.analyzeCV(
          companyId,
          postulation.idPostulacion,
          vacante.idVacante,
          file.buffer,
          vacante.InformacionExtra || ''
        );
      }).catch((aiError) => {
        this.logger.error('Error asíncrono en el procesamiento de la IA para el CV:', aiError);
      });

      return { message: "Postulación aplicada correctamente" };

    } catch (error) {
      if (physicalPathToDelete && fs.existsSync(physicalPathToDelete)) {
        try {
          fs.unlinkSync(physicalPathToDelete);
          this.logger.log(`Rollback del archivo ejecutado con éxito: ${physicalPathToDelete}`);
        } catch (unlinkError) {
          this.logger.error('Error al intentar borrar el archivo durante el rollback:', unlinkError);
        }
      }

      this.logger.error('Error en CandidatesService:', error);
      throw new BadRequestException(error.message);
    }
  }

  // Esta función obtiene el catalogo de estatus de las postulaciones
  async getStatus() {
    const statuses = await this.prisma.catEstatusPostulacion.findMany({ where: { activo: true } });
    return statuses.map(s => ({
      id: s.idEstatusPostulacion,
      description: s.descripcion
    }));
  }

  // Esta función obtiene el detalle de una postulación por su id
  async getPostulation(companyId: number, postulationId: number) {
    try {
      const rows = await PostulationsQueries.getProfileEvaluationDetail(
        this.prisma,
        companyId,
        postulationId
      );

      if (!rows || rows.length === 0) {
        throw new NotFoundException(`No se encontró la evaluación de la postulación con ID ${postulationId}`);
      }

      const rawData = rows[0];

      const safeJsonParse = (str: string | null, defaultValue: any) => {
        if (!str) return defaultValue;
        try {
          return typeof str === 'string' ? JSON.parse(str) : str;
        } catch {
          return defaultValue;
        }
      };

      // 1. Parseamos los índices técnicos y competenciales
      let indices = safeJsonParse(rawData.indices, {});
      if (indices && Object.keys(indices).length > 0) {
        // Aplicamos tu helper de porcentaje tal como se hacía en Python
        indices['indice_ajuste_tecnico'] = calculatePercentage(indices['indice_ajuste_tecnico']);
        indices['indice_ajuste_competencial'] = calculatePercentage(indices['indice_ajuste_competencial']);
      }

      const categoriasRaw = safeJsonParse(rawData.detalle_por_categoria, []);
      const fortalezas_clave = safeJsonParse(rawData.fortalezas_clave, []);
      const brechas_criticas = safeJsonParse(rawData.brechas_criticas, []);
      const requisitos_knockout = safeJsonParse(rawData.requisitos_knockout, []);

      // 2. Parseamos y aplicamos el helper a cada categoría del desglose
      const detalle_por_categoria = Array.isArray(categoriasRaw)
        ? categoriasRaw.map((c: any) => {
          return {
            ...c,
            // Pasamos por el helper los valores numéricos de cumplimiento y score ponderado
            porcentaje_cumplimiento: calculatePercentage(c.porcentaje_cumplimiento),
            score_ponderado: calculatePercentage(c.score_ponderado),
          };
        })
        : [];

      return {
        profile_data: {
          nombre: rawData.nombre,
          primerApellido: rawData.primerApellido,
          segundoApellido: rawData.segundoApellido,
          NombrePuesto: rawData.NombrePuesto,
          fechaRegistro: rawData.fechaRegistro,
          resumen: rawData.resumen,
          estado_proceso: rawData.estado_proceso,
          estatus_vacante: rawData.estatus_postulacion,
          score_global: rawData.score_global ? Number(rawData.score_global) : null,
          clasificacion: rawData.clasificacion,
          decision: rawData.decision,
          indices,
          detalle_por_categoria,
          fortalezas_clave,
          brechas_criticas,
          requisitos_knockout
        }
      };

    } catch (error) {
      if (error instanceof NotFoundException) throw error;

      this.logger.error('Error al obtener la evaluación del postulante:', error);
      throw new InternalServerErrorException('Error interno al procesar la evaluación del postulante');
    }
  }

  // Esta función obtiene el estatus de una postulación por su id
  async updateStatus(companyId: number, postulationId: number, dto: UpdatePostulationStatusDto, user: ActiveUserDto, files: Express.Multer.File[]) {
    try {
      const postulation = await this.prisma.postulaciones.findFirst({
        where: { idPostulacion: postulationId }
      });
      if (!postulation) throw new NotFoundException('Postulación no encontrada');
      if (!postulation.curp) throw new Error('Los datos del postulante no estan completos');

      const statuses = await this.prisma.catEstatusPostulacion.findMany({ where: { activo: true } });
      const statusMap = new Map(statuses.map(s => [s.idEstatusPostulacion, s.descripcion]));

      const currentStatus = postulation.idEstatus || 1;
      const nextStatus = dto.statusId;
      const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
      if (!allowedTransitions.includes(nextStatus)) {
        const currentStatusName = statusMap.get(currentStatus) || 'DESCONOCIDO';
        const nextStatusName = statusMap.get(nextStatus) || 'DESCONOCIDO';
        const allowedNames = allowedTransitions.map(id => statusMap.get(id));
        throw new BadRequestException(`No se puede cambiar de ${currentStatusName} a ${nextStatusName}. Estado actual: ${currentStatusName}, Estados permitidos: ${allowedNames.join(', ')}`);
      }

      if (dto.statusId === 6) {
        const vacancy = await this.prisma.vacantes.findFirst({
          where: { idVacante: postulation.idVacante }
        });

        await generateCredentials(
          {
            curp: postulation.curp,
            nombre: postulation.nombre,
            apellido1: postulation.primerApellido,
            apellido2: postulation.segundoApellido || '',
            correo: postulation.correo,
            idPuesto: vacancy?.idPuesto ?? 0,
            usuario: user.username || 'sistema',
            idCampania: dto.campaignId || null,
          },
          files ?? [],
          this.prisma,
          this.notifications.notify.bind(this.notifications)
        );
      }

      await this.prisma.$transaction(async (tx) => {
        const updatedPostulation = tx.postulaciones.update({
          where: { idPostulacion: postulationId },
          data: { idEstatus: dto.statusId }
        });
        const log = tx.historicoMovimientos.create({
          data: {
            idUsuario: user.id,
            idEmpresa: companyId,
            accion: 'EDITAR',
            tablaOrigen: 'Postulaciones',
            idRegistro: String(postulationId),
            descripcion: `Estatus de la postulación de ${postulation.nombre} ${postulation.primerApellido} ${postulation.segundoApellido} actualizado a ${statusMap.get(dto.statusId)} por ${user.first_name} ${user.last_name}`,
            fechaCreacion: new Date()
          }
        });
        return Promise.all([updatedPostulation, log]);
      })

      return { message: 'Estatus de la postulación actualizado correctamente' };
    }
    catch (error) { throw error; }
  }
}