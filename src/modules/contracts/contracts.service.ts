import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDispatcher,
    private readonly configService: ConfigService,
  ) { }

  async create(companyId: number, employeeId: number, dto: CreateContractDto, userId: number) {
    const employee = await this.prisma.empleados.findFirst({
      where: { idEmpleado: employeeId, idEmpresa: companyId, activo: true },
    });

    if (!employee) {
      throw new NotFoundException('Empleado no encontrado o no pertenece a esta empresa');
    }

    const existingContract = await this.prisma.contratos.findFirst({
      where: { idEmpleado: employeeId },
      include: { CatEstatusContratos: { select: { idEstatusContrato: true, descripcion: true } } },
    });

    // RENOVAR CONTRATO: si ya existe un contrato, ligar el nuevo documento al contrato existente
    if (existingContract) {
      if (dto.idDocumentoGenerado) {
        await this.prisma.documentosGenerados.update({
          where: { id: dto.idDocumentoGenerado },
          data: { idContrato: existingContract.idContrato },
        });
        // Actualizar estatus del contrato a "Enviado a firma"
        await this.prisma.contratos.update({
          where: { idContrato: existingContract.idContrato },
          data: { idEstatusContrato: 2 },
        });
        await this.sendSigningLink(existingContract.idContrato);
      }
      return existingContract;
    }

    const contrato = await this.prisma.contratos.create({
      data: {
        idEmpleado: employeeId,
        idTemplate: dto.idTemplate ?? null,
        idEstatusContrato: 1,
        fechaInicioContrato: dto.fechaInicioContrato ? new Date(dto.fechaInicioContrato) : null,
        fechaTerminoContrato: dto.fechaTerminoContrato ? new Date(dto.fechaTerminoContrato) : null,
        usuarioRegistro: String(userId),
      },
      include: {
        CatEstatusContratos: { select: { idEstatusContrato: true, descripcion: true } },
      },
    });

    if (dto.idDocumentoGenerado) {
      await this.prisma.documentosGenerados.update({
        where: { id: dto.idDocumentoGenerado },
        data: { idContrato: contrato.idContrato },
      });
    }

    await this.sendSigningLink(contrato.idContrato);

    return contrato;
  }

  private async sendSigningLink(idContrato: number) {
    try {
      const contrato = await this.prisma.contratos.findFirst({
        where: { idContrato },
        include: {
          Empleados: {
            select: {
              idEmpleado: true,
              nombre: true,
              primerApellido: true,
              correo: true,
              telefonoMovil: true,
              idUsuario: true,
              idEmpresa: true,
            },
          },
          documentosGenerados: { take: 1, orderBy: { id: 'desc' } },
        },
      });

      if (!contrato) return;
      const documento = contrato.documentosGenerados[0];
      if (!documento) return;

      // Generar token de firma si no existe
      if (!documento.tokenFirma) {
        documento.tokenFirma = crypto.randomUUID();
        await this.prisma.documentosGenerados.update({
          where: { id: documento.id },
          data: { tokenFirma: documento.tokenFirma },
        });
      }

      const empleado = contrato.Empleados;
      const empresa = empleado.idEmpresa
        ? await this.prisma.catEmpresas.findFirst({
          where: { idEmpresa: empleado.idEmpresa },
          select: { nombre_comercial: true },
        })
        : null;

      const frontendUrl = this.configService.getOrThrow<string>('FRONT_URL');
      const linkFirma = `${frontendUrl}firmar/${documento.tokenFirma}`;
      const nombreCompleto = `${empleado.nombre} ${empleado.primerApellido}`.trim();
      const userUuid = empleado.idUsuario || `empleado-${empleado.idEmpleado}`;

      await this.notifications.notify({
        userUuid,
        notificationTypeCode: 'CONTRACT_SIGN',
        to: empleado.correo || undefined,
        phone: empleado.telefonoMovil || undefined,
        subject: '✍️ Firma de Contrato Pendiente',
        context: {
          nombre: nombreCompleto,
          empresa: empresa?.nombre_comercial || 'Empresa',
          linkFirma,
        },
      });

      this.logger.log(`Link de firma enviado a ${empleado.correo} / ${empleado.telefonoMovil} para contrato ${idContrato}`);
    } catch (error) {
      this.logger.error(`Error enviando link de firma para contrato ${idContrato}: ${error.message}`);
    }
  }

  async updateStatus(companyId: number, contractId: number, idEstatusContrato: number) {
    const contrato = await this.prisma.contratos.findFirst({
      where: {
        idContrato: contractId,
        Empleados: { idEmpresa: companyId },
      },
    });

    if (!contrato) {
      throw new NotFoundException('Contrato no encontrado');
    }

    const estatus = await this.prisma.catEstatusContratos.findFirst({
      where: { idEstatusContrato, activo: true },
    });

    if (!estatus) {
      throw new BadRequestException('Estatus de contrato no válido');
    }

    const updateData: any = { idEstatusContrato };

    if (idEstatusContrato === 3) {
      updateData.fechaFirma = new Date();
    }

    return this.prisma.contratos.update({
      where: { idContrato: contractId },
      data: updateData,
      include: {
        CatEstatusContratos: { select: { idEstatusContrato: true, descripcion: true } },
      },
    });
  }

  async getReadyToHire(companyId: number, page: number, limit: number, search: string) {
    const offset = (page - 1) * limit;

    // Construir la condición de búsqueda para SQL de manera segura
    const searchQuery = search ? `%${search}%` : null;

    // Ejecutar la consulta paginada de datos y el conteo total en paralelo
    const [rawData, totalResult] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT 
          e.idEmpleado,
          CONCAT(e.nombre, ' ', e.primerApellido, ' ', IFNULL(e.segundoApellido, '')) AS nombreCompleto,
          p.NombrePuesto AS puesto,
          ex.idEstatus AS idEstatusExpediente,
          IFNULL(c.idEstatusContrato, 1) AS idEstatusContrato,
          IFNULL(cec.descripcion, 'PENDIENTE DE GENERAR') AS estatusContratoDescripcion,
          IFNULL(c.fechaInicioContrato, 'PENDIENTE') AS fechaContratoInicio,
          IFNULL(c.fechaTerminoContrato, 'PENDIENTE') AS fechaContratoTermino,
          IFNULL(hs.salarioBruto, null) AS sueldo,
          c.idContrato,
          (SELECT dg2.id FROM DocumentosGenerados dg2
             WHERE dg2.idContrato = c.idContrato
               AND dg2.archivoGenerado IS NOT NULL
             ORDER BY dg2.fechaGeneracion DESC
             LIMIT 1) AS idDocumentoGenerado
        FROM Empleados e
        INNER JOIN Expedientes ex ON e.idEmpleado = ex.idEmpleado
        INNER JOIN CatPuestos p ON e.idPuesto = p.idPuesto
        LEFT JOIN Contratos c ON e.idEmpleado = c.idEmpleado
        LEFT JOIN CatEstatusContratos cec ON c.idEstatusContrato = cec.idEstatusContrato
        LEFT JOIN HistorialSalarios hs ON hs.idEmpleado = e.idEmpleado AND hs.actual = true
        WHERE e.idEmpresa = ${companyId}
          AND e.activo = 1
          AND ex.idEstatus = 4
          AND (${searchQuery} IS NULL OR 
               e.nombre LIKE ${searchQuery} OR 
               e.primerApellido LIKE ${searchQuery} OR 
               e.segundoApellido LIKE ${searchQuery} OR 
               e.rfc LIKE ${searchQuery})
        ORDER BY e.nombre ASC
        LIMIT ${limit} OFFSET ${offset};
      `,

      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM Empleados e
        INNER JOIN Expedientes ex ON e.idEmpleado = ex.idEmpleado
        WHERE e.idEmpresa = ${companyId}
          AND e.activo = 1
          AND ex.idEstatus = 4
          AND (${searchQuery} IS NULL OR 
               e.nombre LIKE ${searchQuery} OR 
               e.primerApellido LIKE ${searchQuery} OR 
               e.segundoApellido LIKE ${searchQuery} OR 
               e.rfc LIKE ${searchQuery});
      `
    ]);

    // Limpiar BigInts del arreglo de datos mapeando valores numéricos
    const data = rawData.map(item => ({
      ...item,
      idEmpleado: item.idEmpleado ? Number(item.idEmpleado) : null,
      idContrato: item.idContrato ? Number(item.idContrato) : null,
      idDocumentoGenerado: item.idDocumentoGenerado ? Number(item.idDocumentoGenerado) : null,
      idEstatusContrato: item.idEstatusContrato ? Number(item.idEstatusContrato) : 1,
      idEstatusExpediente: item.idEstatusExpediente ? Number(item.idEstatusExpediente) : null,
    }));

    // Convertir el BigInt del conteo total de forma segura
    const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

    // Retornar la estructura estándar de paginación
    return {
      data,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}