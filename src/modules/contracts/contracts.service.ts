import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import * as ExcelJS from 'exceljs';
import { UploadErrorDetail } from './interfaces/contracts.interfaces';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDispatcher,
    private readonly configService: ConfigService,
  ) { }

  async generateSalaryUpdateTemplate(companyId: number): Promise<Buffer> {
    // 1. Obtener empleados activos de la empresa junto con su historial de salarios actual
    const empleados = await this.prisma.empleados.findMany({
      where: {
        idEmpresa: companyId,
        activo: true,
      },
      select: {
        numeroEmpleado: true,
        nombre: true,
        primerApellido: true,
        segundoApellido: true,
        HistorialSalarios: {
          where: { actual: true },
          include: {
            CatTiposMoneda: true,
            CatPeriodicidadesPago: true,
          },
          take: 1,
        },
      },
      orderBy: { numeroEmpleado: 'asc' },
    });

    // 2. Obtener los catálogos activos para las listas desplegables
    const tiposMoneda = await this.prisma.catTiposMoneda.findMany({
      where: { activo: true },
      select: { codigo: true }, // O descripción, según prefieras mostrar en el dropdown
      orderBy: { idTipoMoneda: 'asc' },
    });

    const periodicidades = await this.prisma.catPeriodicidadesPago.findMany({
      where: { activo: true },
      select: { descripcion: true },
      orderBy: { idPeriodicidadPago: 'asc' },
    });

    const monedaList = tiposMoneda.map((m) => m.codigo);
    const periodicidadList = periodicidades.map((p) => p.descripcion);

    // 3. Crear el libro de Excel con ExcelJS
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Actualización de Salarios');

    // Definir columnas principales
    sheet.columns = [
      { header: 'Número de Empleado', key: 'numeroEmpleado', width: 22 },
      { header: 'Nombre Completo', key: 'nombreCompleto', width: 35 },
      { header: 'Salario Bruto Actual', key: 'salarioBruto', width: 22 },
      { header: 'Salario Neto Actual', key: 'salarioNeto', width: 22 },
      { header: 'Tipo de Moneda', key: 'tipoMoneda', width: 20 },
      { header: 'Periodicidad de Pago', key: 'periodicidadPago', width: 25 },
    ];

    // Estilos de cabecera
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '1F4E78' }, // Color azul institucional
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // 4. Rellenar los datos de cada empleado
    empleados.forEach((emp) => {
      const nombreCompleto = `${emp.nombre || ''} ${emp.primerApellido || ''} ${emp.segundoApellido || ''}`.trim();
      const salarioActual = emp.HistorialSalarios?.[0];

      sheet.addRow({
        numeroEmpleado: emp.numeroEmpleado || 'S/N',
        nombreCompleto: nombreCompleto,
        salarioBruto: salarioActual ? Number(salarioActual.salarioBruto) : 0,
        salarioNeto: salarioActual ? Number(salarioActual.salarioNeto) : 0,
        tipoMoneda: salarioActual?.CatTiposMoneda?.codigo || 'MXN',
        periodicidadPago: salarioActual?.CatPeriodicidadesPago?.descripcion || 'Mensual',
      });
    });

    // 5. Aplicar formato, alineaciones, moneda y validaciones de datos (Listas desplegables)
    const totalRows = empleados.length > 0 ? empleados.length + 1 : 100; // Rango dinámico o hasta la fila 100 por defecto

    for (let rowNumber = 2; rowNumber <= totalRows; rowNumber++) {
      const row = sheet.getRow(rowNumber);

      // Alinear celdas de texto / códigos
      row.getCell('numeroEmpleado').alignment = { horizontal: 'center' };
      row.getCell('tipoMoneda').alignment = { horizontal: 'center' };
      row.getCell('periodicidadPago').alignment = { horizontal: 'center' };

      // Formato de moneda para salarios
      const brutoCell = row.getCell('salarioBruto');
      brutoCell.numFmt = '"$"#,##0.00';

      const netoCell = row.getCell('salarioNeto');
      netoCell.numFmt = '"$"#,##0.00';

      // Validación para Tipo de Moneda (Lista desplegable basada en el catálogo de BD)
      if (monedaList.length > 0) {
        row.getCell('tipoMoneda').dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${monedaList.join(',')}"`],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Valor inválido',
          error: 'Por favor, selecciona un tipo de moneda válido de la lista.',
        };
      }

      // Validación para Periodicidad de Pago (Lista desplegable basada en el catálogo de BD)
      if (periodicidadList.length > 0) {
        row.getCell('periodicidadPago').dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${periodicidadList.join(',')}"`],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Valor inválido',
          error: 'Por favor, selecciona una periodicidad de pago válida de la lista.',
        };
      }
    }

    // 6. Generar el buffer de salida
    const buffer = (await workbook.xlsx.writeBuffer()) as any;
    return buffer;
  }

  async processBulkSalariesUpdate(
    companyId: number,
    file: Express.Multer.File,
    activeUser: ActiveUserDto,
  ) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as any);
    } catch {
      throw new BadRequestException('El archivo Excel está dañado o no tiene un formato válido.');
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('El archivo Excel no contiene hojas de trabajo.');
    }

    // Cargar catálogos activos en memoria
    const tiposMoneda = await this.prisma.catTiposMoneda.findMany({ where: { activo: true } });
    const periodicidades = await this.prisma.catPeriodicidadesPago.findMany({ where: { activo: true } });

    const errores: UploadErrorDetail[] = [];
    let successCount = 0;

    const rows: { rowNumber: number; values: any }[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Omitir cabecera
      rows.push({ rowNumber, values: row.values });
    });

    if (rows.length === 0) {
      throw new BadRequestException('El archivo Excel se encuentra vacío.');
    }

    // Procesar cada fila del Excel
    for (const item of rows) {
      const rowNumber = item.rowNumber;
      const rowValues = item.values;

      const numeroEmpleado = rowValues[1] ? String(rowValues[1]).trim() : null;
      const salarioBruto = rowValues[3] !== undefined && rowValues[3] !== null ? Number(rowValues[3]) : 0;
      const salarioNeto = rowValues[4] !== undefined && rowValues[4] !== null ? Number(rowValues[4]) : 0;
      const monedaCodigo = rowValues[5] ? String(rowValues[5]).trim() : null;
      const periodicidadDesc = rowValues[6] ? String(rowValues[6]).trim() : null;

      if (!numeroEmpleado) {
        errores.push({ row: rowNumber, error: 'El número de empleado es obligatorio.' });
        continue;
      }

      // VALIDACIÓN 1: Si el salario bruto y neto son 0, se ignoran por completo
      if (salarioBruto === 0 && salarioNeto === 0) {
        continue;
      }

      if (isNaN(salarioBruto) || salarioBruto < 0) {
        errores.push({ row: rowNumber, error: `El salario bruto no es un número válido.` });
        continue;
      }

      if (isNaN(salarioNeto) || salarioNeto < 0) {
        errores.push({ row: rowNumber, error: `El salario neto no es un número válido.` });
        continue;
      }

      // Validar Tipo de Moneda en catálogo
      const monedaObj = tiposMoneda.find(
        (m) => m.codigo.toLowerCase() === monedaCodigo?.toLowerCase()
      );
      if (!monedaObj) {
        errores.push({ row: rowNumber, error: `El tipo de moneda '${monedaCodigo}' no existe o no es válido.` });
        continue;
      }

      // Validar Periodicidad de Pago en catálogo
      const periodicidadObj = periodicidades.find(
        (p) => p.descripcion.toLowerCase() === periodicidadDesc?.toLowerCase()
      );
      if (!periodicidadObj) {
        errores.push({ row: rowNumber, error: `La periodicidad de pago '${periodicidadDesc}' no existe o no es válida.` });
        continue;
      }

      // Buscar al empleado dentro de la empresa
      const empleado = await this.prisma.empleados.findFirst({
        where: {
          numeroEmpleado: numeroEmpleado,
          idEmpresa: companyId,
        },
      });

      if (!empleado) {
        errores.push({ row: rowNumber, error: `No se encontró ningún empleado con el número '${numeroEmpleado}'.` });
        continue;
      }

      // Obtener el salario actual registrado en el historial para este empleado
      const salarioActual = await this.prisma.historialSalarios.findFirst({
        where: {
          idEmpleado: empleado.idEmpleado,
          actual: true,
        },
      });

      // VALIDACIÓN 2: Verificar si el salario del Excel es idéntico al que ya tiene registrado como actual
      const esIgual =
        salarioActual &&
        Number(salarioActual.salarioBruto) === Number(salarioBruto) &&
        Number(salarioActual.salarioNeto) === Number(salarioNeto) &&
        salarioActual.idTipoMoneda === monedaObj.idTipoMoneda &&
        salarioActual.idPeriodicidadPago === periodicidadObj.idPeriodicidadPago;

      if (esIgual) {
        // No hubo cambios, se omite para no duplicar registros
        continue;
      }

      try {
        // Realizar la transacción: desactiva el anterior e inserta el nuevo
        await this.prisma.$transaction(async (prisma) => {
          if (salarioActual) {
            await prisma.historialSalarios.update({
              where: { idHistorialSalario: salarioActual.idHistorialSalario },
              data: { actual: false },
            });
          }

          await prisma.historialSalarios.create({
            data: {
              idEmpleado: empleado.idEmpleado,
              idTipoMoneda: monedaObj.idTipoMoneda,
              idPeriodicidadPago: periodicidadObj.idPeriodicidadPago,
              salarioBruto: salarioBruto,
              salarioNeto: salarioNeto,
              fechaInicio: new Date(),
              actual: true,
              usuarioRegistro: `${activeUser?.first_name || 'Admin'} ${activeUser?.last_name || ''}`.trim(),
            },
          });
        });

        successCount++;
      } catch (dbError: any) {
        errores.push({ row: rowNumber, error: `Error al guardar en base de datos: ${dbError.message}` });
      }
    }

    return {
      message: 'Proceso de actualización masiva de salarios finalizado.',
      updatedCount: successCount,
      errorsCount: errores.length,
      errors: errores,
    };
  }

  async create(companyId: number, employeeId: number, dto: CreateContractDto, activeUser: ActiveUserDto) {
    const userId = activeUser.id;

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

    await this.prisma.historicoMovimientos.create({
      data: {
        idUsuario: activeUser.id,
        idEmpresa: companyId,
        accion: 'UPDATE',
        tablaOrigen: 'DocumentosGenerados',
        idRegistro: String(dto.idDocumentoGenerado),
        descripcion: `Contrato enviado para su firma por ${activeUser.first_name} ${activeUser.last_name}`,
        fechaCreacion: new Date()
      }
    })

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
          -- AND ex.idEstatus = 4
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
          -- AND ex.idEstatus = 4
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