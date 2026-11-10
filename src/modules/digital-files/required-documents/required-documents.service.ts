import { Injectable, Logger } from "@nestjs/common";
import { Users } from "openai/resources/admin/organization/groups/users";
import { ActiveUserDto } from "src/modules/auth/dto/active-user.dto";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateRequiredDocumentDto } from "./dto/create-required-document.dto";
import { UpdateRequiredDocumentDto } from "./dto/update-required-document.dto";
import { NotificationDispatcher } from "src/modules/notifications/notification.dispatcher";

@Injectable()
export class RequiredDocumentsService {
    private readonly logger = new Logger(RequiredDocumentsService.name);

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findAll(user: ActiveUserDto, companyId: number, page: number, limit: number, search?: string, soloConValidacion?: boolean) {
        // Definir el objeto de condiciones (Where) dinámico
        const where = {
            idTenant: user.idTenant,
            idEmpresa: companyId,
            ...(search
                ? {
                    OR: [
                        { Descripcion: { contains: search } },
                    ],
                }
                : {}),
            ...(soloConValidacion ? { tieneValidacionAutomatica: true } : {}),
        };

        // Ejecutar de manera concurrente la consulta paginada y el conteo total para optimizar tiempos
        const [documents, total] = await Promise.all([
            this.prisma.catDocumentos.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { IdDocumento: 'asc' },
            }),
            this.prisma.catDocumentos.count({ where }),
        ]);

        // Formatear la respuesta con la metadata de paginación
        return {
            data: documents,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }

    async create(user: ActiveUserDto, companyId: number, createDto: CreateRequiredDocumentDto) {
        const { descripcion, esRequeridoBase, requiereVencimiento, diasVigenciaDefault, diasAlertaPrevio } = createDto;

        const document = await this.prisma.catDocumentos.create({
            data: {
                idTenant: user.idTenant,
                idEmpresa: companyId,
                Descripcion: descripcion,
                EsRequeridoBase: esRequeridoBase,
                requiereVencimiento: requiereVencimiento ?? false,
                diasVigenciaDefault: diasVigenciaDefault ?? null,
                diasAlertaPrevio: diasAlertaPrevio ?? 30,
                FechaRegistro: new Date(),
                UsuarioRegistro: user.username,
                Activo: true,
            },
        });

        // Registrar el movimiento en el histórico
        await this.prisma.historicoMovimientos.create({
            data: {
                idUsuario: user.id,
                idEmpresa: companyId,
                accion: 'CREAR',
                tablaOrigen: 'CatDocumentos',
                idRegistro: String(document.IdDocumento),
                descripcion: `Documento creado por ${user.first_name} ${user.last_name}`,
                fechaCreacion: new Date()
            }
        });

        return { message: "Documento creado correctamente" };
    }

    async update(user: ActiveUserDto, companyId: number, documentId: number, updateDto: UpdateRequiredDocumentDto) {
        const { descripcion, esRequeridoBase, requiereVencimiento, diasVigenciaDefault, diasAlertaPrevio } = updateDto;

        const document = await this.prisma.catDocumentos.findFirst({
            where: {
                idTenant: user.idTenant,
                idEmpresa: companyId,
                IdDocumento: documentId,
            },
        });

        if (!document) {
            throw new Error('Documento no encontrado o no pertenece a la empresa actual');
        }

        await this.prisma.catDocumentos.update({
            where: { IdDocumento: documentId },
            data: {
                Descripcion: descripcion,
                EsRequeridoBase: esRequeridoBase,
                requiereVencimiento: requiereVencimiento ?? document.requiereVencimiento,
                diasVigenciaDefault: diasVigenciaDefault ?? document.diasVigenciaDefault,
                diasAlertaPrevio: diasAlertaPrevio ?? document.diasAlertaPrevio,
            },
        });

        // Registrar el movimiento en el histórico
        await this.prisma.historicoMovimientos.create({
            data: {
                idUsuario: user.id,
                idEmpresa: companyId,
                accion: 'ACTUALIZAR',
                tablaOrigen: 'CatDocumentos',
                idRegistro: String(documentId),
                descripcion: `Documento actualizado por ${user.first_name} ${user.last_name}`,
                fechaCreacion: new Date()
            }
        });

        return { message: "Documento actualizado correctamente" };
    }

    async changeStatus(user: ActiveUserDto, companyId: number, documentId: number, active: boolean) {
        // Verificamos si el área existe y si tiene presencia en la empresa actual
        const document = await this.prisma.catDocumentos.findFirst({
            where: {
                idTenant: user.idTenant,
                idEmpresa: companyId,
                IdDocumento: documentId,
            },
        });

        if (!document) {
            throw new Error('Documento no encontrado o no pertenece a la empresa actual');
        }

        // Si pasa las validaciones (o si es una desactivación directa), actualizamos el estatus
        await this.prisma.catDocumentos.update({
            where: { IdDocumento: documentId },
            data: {
                Activo: active
            },
        });

        // Registrar el movimiento en el histórico
        await this.prisma.historicoMovimientos.create({
            data: {
                idUsuario: user.id,
                idEmpresa: companyId,
                accion: 'VALIDAR',
                tablaOrigen: 'CatDocumentos',
                idRegistro: String(documentId),
                descripcion: `Documento ${active ? 'activado' : 'desactivado'} por ${user.first_name} ${user.last_name}`,
                fechaCreacion: new Date()
            }
        });

        return {
            message: active ? 'Área activada correctamente' : 'Área desactivada correctamente'
        };
    }

}