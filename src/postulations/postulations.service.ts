import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePostulationStatusDto } from './dto/update-status.dto';
import { generateCredentials } from './services/credentials.service';
import { ALLOWED_STATUS_TRANSITIONS } from './utils/allowed-transitions';
import { userFullInfo } from 'src/common/interfaces/user.interface';
import { NotificationDispatcher } from 'src/notifications/notification.dispatcher';
import { HttpService } from '@nestjs/axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PostulationsService {
    constructor(
        private prisma: PrismaService,
        private readonly notifications: NotificationDispatcher,
        private readonly httpService: HttpService,
    ) { }

    async createPostulation(data: any, file: Express.Multer.File) {
        const { vacante_id, nombre, primerApellido, segundoApellido, correo, telefono, curp } = data;
    
        if (!file) throw new BadRequestException('El archivo CV es obligatorio');
    
        try {
          // 1. Obtener nombre de la vacante
          const puesto: any[] = await this.prisma.$queryRaw`
            SELECT NombrePuesto FROM CatPuestos WHERE idPuesto = ${parseInt(vacante_id)}
          `;
          
          const nombrePuestoRaw = puesto[0]?.NombrePuesto || `Puesto_${vacante_id}`;
          const nombrePuesto = nombrePuestoRaw.replace(/\s+/g, '_');
          const nombrePostulante = `${nombre}_${primerApellido}`.replace(/\s+/g, '_');
    
          // 2. Rutas Físicas
          const rootPath = path.join(process.cwd(), 'src', 'media');
          const relativePath = path.join('VACANTES', nombrePuesto, nombrePostulante);
          const targetFolder = path.join(rootPath, relativePath);
    
          if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
          }
    
          const extension = path.extname(file.originalname).toLowerCase();
          const fileName = `CV_${uuidv4()}${extension}`;
          const physicalPath = path.join(targetFolder, fileName);
          const webPath = path.join(relativePath, fileName).replace(/\\/g, '/');
    
          fs.writeFileSync(physicalPath, file.buffer);
    
          // 3. Ejecutar Store Procedure (MySQL)
          // Guardamos el resultado pero lo tratamos con cuidado
          const rawResult: any[] = await this.prisma.$queryRaw`
            CALL SpInsPostulaciones(
              0, 1, ${parseInt(vacante_id)}, ${nombre}, ${primerApellido}, 
              ${segundoApellido || ''}, ${correo}, ${telefono}, ${webPath}, ${curp.toUpperCase()}
            )
          `;
    
          // Extraemos el ID y lo convertimos a número inmediatamente
          // Esto evita que el tipo BigInt se propague al objeto de retorno
          const firstRow = rawResult[0];
          const idRaw = firstRow ? Object.values(firstRow)[0] : null;
          const idPostulacion = (typeof idRaw === 'bigint' ? Number(idRaw) : idRaw) as number;
    
          // 4. Enviar Webhook
          // No esperamos a que termine para no retrasar la respuesta al usuario
          this.sendToWebhook(vacante_id, idPostulacion, file, fileName);
    
          // IMPORTANTE: Solo retornamos datos primitivos limpios
          return {
            success: true,
            ruta_cv: webPath
          };
    
        } catch (error) {
          // Si el error es por BigInt aquí, lo capturamos
          console.error('Error en CandidatesService:', error);
          throw new BadRequestException('Error al procesar el registro: ' + error.message);
        }
    }
    
    private async sendToWebhook(vacanteId: string, postulacionId: number, file: Express.Multer.File, fileName: string) {
        const webhookUrl = "https://dvdigital.app.n8n.cloud/webhook/candidate-sended";
        const formData = new FormData();
        
        const fileData = new Uint8Array(file.buffer);
        const blob = new Blob([fileData], { type: file.mimetype });
    
        formData.append('cv', blob, fileName);
        formData.append('idVacante', vacanteId);
        formData.append('idPostulacion', postulacionId?.toString());
    
        try {
          await this.httpService.axiosRef.post(webhookUrl, formData);
        } catch (err) {
          console.error('Error enviando a n8n:', err.message);
        }
    }

    async getStatus() {
        const statuses = await this.prisma.catEstatusVacante.findMany({ where: { activo: true } });
        return statuses.map(s => ({
            id: s.idEstatusVacante,
            description: s.decripcion
        }));
    }

    async updateStatus(companyId: number, postulationId: number, dto: UpdatePostulationStatusDto, user: userFullInfo, files: Express.Multer.File[]) {
        try {
            const postulation = await this.prisma.postulaciones.findFirst({
                where: { idPostulacion: postulationId }
            });
            if (!postulation) throw new NotFoundException('Postulación no encontrada');
            if (!postulation.curp) throw new Error('Los datos del postulante no estan completos');

            const statuses = await this.prisma.catEstatusVacante.findMany({ where: { activo: true } });
            const statusMap = new Map(statuses.map(s => [s.idEstatusVacante, s.decripcion]));

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
                await generateCredentials(
                    {
                        curp: postulation.curp,
                        nombre: postulation.nombre,
                        apellido1: postulation.primerApellido,
                        apellido2: postulation.segundoApellido || '',
                        correo: postulation.correo,
                        idPuesto: postulation.idPuesto ?? 0,
                        usuario: user.username || 'sistema',
                        idCampania: dto.campaignId || null,
                    },
                    files ?? [],
                    this.prisma,
                    this.notifications.notify.bind(this.notifications)
                );
            }

            return await this.prisma.postulaciones.update({
                where: { idPostulacion: postulationId },
                data: { idEstatus: dto.statusId }
            });
        }
        catch (error) { throw error; }
    }
}