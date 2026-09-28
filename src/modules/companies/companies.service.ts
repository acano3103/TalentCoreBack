import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import * as fs from 'fs';
import * as path from 'path';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { MediaPathService } from 'src/common/services/media-path.service';
import * as ExcelJS from 'exceljs';
import { seedDocumentosEmpresa } from './seeds/default-documentos.seed';

@Injectable()
export class CompaniesService {
    constructor(
        private prismaService: PrismaService,
        private mediaPathService: MediaPathService,
    ) { }

    private readonly logger = new Logger(CompaniesService.name);

    // Obtiene todas las empresas paginadas de un tenant especifico
    async findAll(page: number, query: string, limit: number, user: ActiveUserDto) {
        const skip = (page - 1) * limit;

        const whereCondition: any = {};

        if (query) {
            whereCondition.OR = [
                { nombre_comercial: { contains: query } },
                { rfc: { contains: query } },
            ];
            whereCondition.idTenant = user.idTenant;
        } else {
            whereCondition.idTenant = user.idTenant;
        }

        const [companies, total] = await Promise.all([
            this.prismaService.catEmpresas.findMany({
                where: whereCondition,
                skip: skip,
                take: limit,
                orderBy: { fechaRegistro: 'desc' },
            }),
            this.prismaService.catEmpresas.count({ where: whereCondition }),
        ]);

        if ((!companies || companies.length === 0) && page === 1 && !query) {
            return {
                companies: [],
                total: 0,
                currentPage: 1,
                totalPages: 1,
            };
        }

        return {
            companies,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }

    // Obtiene una empresa por id de un tenant especifico
    async findOne(id: string, user: ActiveUserDto) {
        const company = await this.prismaService.catEmpresas.findUnique({
            where: { idEmpresa: Number(id), idTenant: user.idTenant },
            include: {
                DomicilioEmpresas: true,
            },
        });

        if (!company) throw new NotFoundException('No se encontró la empresa especificada');

        const { DomicilioEmpresas, ...companyData } = company;

        const addressObject = Array.isArray(DomicilioEmpresas)
            ? DomicilioEmpresas[0]
            : DomicilioEmpresas || {};

        return {
            ...companyData,
            ...addressObject,
        };
    }

    // Crea una nueva empresa en un tenant especifico
    async create(dto: CreateCompanyDto, file: Express.Multer.File, activeUser: ActiveUserDto) {
        const user = await this.prismaService.auth_user.findUnique({ where: { id: activeUser.id } });
        if (!user) throw new NotFoundException('No se encontró el usuario');
        if (!user.idTenant) throw new BadRequestException('El usuario no tiene un tenant asignado');
        const idTenant = user.idTenant;

        let logoPath: string | null = null;

        if (file) {
            try {
                const safeCommercialName = dto.nombre_comercial
                    .replace(/[^a-zA-Z0-9\s-_]/g, '')
                    .trim()
                    .replace(/\s+/g, '_');

                const folderName = safeCommercialName || 'default_company';
                const fileExtension = path.extname(file.originalname).toLowerCase();
                const logoName = `logo_${folderName}${fileExtension}`;
                const baseMediaFolder = process.env.MEDIA_ROOT_PATH || path.resolve(process.cwd(), 'media');

                const absoluteFolder = await this.mediaPathService.getTenantPath(baseMediaFolder, idTenant, path.join('logo', folderName));
                const absolutePath = path.join(absoluteFolder, logoName);

                if (!absolutePath.startsWith(baseMediaFolder)) throw new BadRequestException('Path Injection is not allowed.');

                fs.writeFileSync(absolutePath, file.buffer);

                const tenant = await this.prismaService.catTenants.findUnique({ where: { idTenant }, select: { slug: true } });
                logoPath = `/media/${tenant?.slug}/logo/${folderName}/${logoName}`;
            } catch (fileError) {
                if (fileError instanceof BadRequestException) throw fileError;
                throw new InternalServerErrorException(`Failed to save logo file: ${fileError.message}`);
            }
        }

        try {
            await this.prismaService.$transaction(async (tx) => {
                const nuevaEmpresa = await tx.catEmpresas.create({
                    data: {
                        idTenant: user.idTenant,
                        razon_social: dto.razon_social,
                        nombre_comercial: dto.nombre_comercial,
                        correo: dto.correo,
                        telefono: dto.telefono,
                        rfc: dto.rfc,
                        logo_empresa: logoPath,
                        usuarioRegistro: user?.uuid,
                    },
                });

                await tx.domicilioEmpresas.create({
                    data: {
                        idEmpresa: nuevaEmpresa.idEmpresa,
                        idTenant: idTenant,
                        codigo_postal: dto.codigo_postal_empresa,
                        idColonia: dto.colonia_empresa,
                        colonia: dto.colonia_empresa_text || '',
                        municipio: dto.municipio_empresa,
                        estado: dto.estado_empresa,
                        calle: dto.calle_empresa,
                        numero_exterior: dto.numero_exterior_empresa || '',
                        numero_interior: dto.numero_interior_empresa || '',
                        usuarioRegistro: user?.uuid,
                    },
                });

                // Sembrar documentos base por empresa
                await seedDocumentosEmpresa(tx, {
                    idTenant: idTenant,
                    idEmpresa: nuevaEmpresa.idEmpresa,
                    usuarioRegistro: user?.uuid || 'system_seed',
                });
            });

            return { success: true, message: 'Company created successfully' };
        } catch (dbError) {
            throw new InternalServerErrorException(`Database transaction failed: ${dbError.message}`);
        }
    }

    // Actualiza una empresa de un tenant especifico
    async update(id: string, dto: UpdateCompanyDto, file: Express.Multer.File, activeUser: ActiveUserDto) {
        const user = await this.prismaService.auth_user.findUnique({ where: { id: activeUser.id } });
        if (!user) throw new NotFoundException('No se encontró el usuario');
        if (!user.idTenant) throw new BadRequestException('El usuario no tiene un tenant asignado');

        const idTenant = user.idTenant;

        const idEmpresa = Number(id);
        const companyExists = await this.prismaService.catEmpresas.findUnique({
            where: { idEmpresa, idTenant: user.idTenant },
        });
        if (!companyExists) throw new NotFoundException('No se encontró la empresa especificada');

        const rfcLimpio = dto.rfc.replace(/[\s-]/g, '').toUpperCase();
        if (rfcLimpio.length > 13) throw new BadRequestException('El RFC no puede superar los 13 caracteres.');
        let logoPath: string | null = null;

        if (file) {
            try {
                const safeCommercialName = dto.nombre_comercial.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');
                const folderName = safeCommercialName || 'default_company';
                const fileExtension = path.extname(file.originalname).toLowerCase();
                const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
                const logoName = `logo_${folderName}_${timestamp}${fileExtension}`;

                const baseMediaFolder = process.env.MEDIA_ROOT_PATH || path.resolve(process.cwd(), 'media');
                const absoluteFolder = await this.mediaPathService.getTenantPath(baseMediaFolder, idTenant, path.join('logo', folderName));
                const absolutePath = path.join(absoluteFolder, logoName);

                if (!absolutePath.startsWith(baseMediaFolder)) throw new BadRequestException('Intento de Path Injection detectado.');

                fs.writeFileSync(absolutePath, file.buffer);

                const tenant = await this.prismaService.catTenants.findUnique({ where: { idTenant }, select: { slug: true } });
                logoPath = `/media/${tenant?.slug}/logo/${folderName}/${logoName}`;
            } catch (fileError) {
                if (fileError instanceof BadRequestException) throw fileError;
                throw new InternalServerErrorException(`Failed to save logo file: ${fileError.message}`);
            }
        }

        try {
            await this.prismaService.$transaction(async (tx) => {
                await tx.catEmpresas.update({
                    where: { idEmpresa, idTenant: user.idTenant },
                    data: {
                        razon_social: dto.razon_social,
                        nombre_comercial: dto.nombre_comercial,
                        correo: dto.correo,
                        telefono: dto.telefono,
                        rfc: rfcLimpio,
                        ...(logoPath && { logo_empresa: logoPath }),
                        usuarioRegistro: user?.uuid,
                    },
                });

                const domicilioExistente = await tx.domicilioEmpresas.findFirst({
                    where: { idEmpresa }
                });

                const datosDomicilio = {
                    codigo_postal: dto.codigo_postal,
                    idColonia: dto.colonia,
                    colonia: dto.colonia_text || '',
                    municipio: dto.municipio,
                    estado: dto.estado,
                    calle: dto.calle,
                    numero_exterior: dto.numero_exterior || '',
                    numero_interior: dto.numero_interior || '',
                    usuarioRegistro: user?.uuid,
                };

                if (domicilioExistente) {
                    await tx.domicilioEmpresas.update({
                        where: { idDomicilioEmpresa: domicilioExistente.idDomicilioEmpresa },
                        data: datosDomicilio,
                    });
                } else {
                    await tx.domicilioEmpresas.create({
                        data: {
                            idEmpresa,
                            idTenant: idTenant,
                            ...datosDomicilio,
                        },
                    });
                }
            });
            return { message: 'Empresa actualizada correctamente' };
        } catch (dbError: any) {
            this.logger.error(`Error al actualizar la empresa: ${dbError.message}`);
            throw new InternalServerErrorException(`Error al actualizar la empresa`);
        }
    }

    // Activa o desactiva una empresa de un tenant especifico
    async changeStatus(id: string, active: boolean, user: ActiveUserDto) {
        const userRecord = await this.prismaService.auth_user.findUnique({ where: { id: user.id } });
        if (!userRecord) throw new NotFoundException('No se encontró el usuario');

        const idEmpresa = Number(id);

        try {
            await this.prismaService.catEmpresas.update({
                where: { idEmpresa, idTenant: userRecord.idTenant },
                data: {
                    activo: active,
                    usuarioRegistro: userRecord.uuid
                },
            });
        } catch (dbError: any) {
            throw new NotFoundException('No se encontró la empresa especificada');
        }

        return {
            message: active ? 'Empresa activada correctamente' : 'Empresa desactivada correctamente'
        };
    }

    // Genera y retorna un Buffer con la plantilla Excel para carga masiva
    async generateBulkTemplate(activeUser: ActiveUserDto): Promise<Buffer> {
        const user = await this.prismaService.auth_user.findUnique({ where: { id: activeUser.id } });
        if (!user) throw new NotFoundException('No se encontró el usuario');
        if (!user.idTenant) throw new BadRequestException('El usuario no tiene un tenant asignado');

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Talent Core';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Empresas');

        // Definición de columnas (Datos Generales + Domicilio Fiscal)
        sheet.columns = [
            { header: 'Razón Social *', key: 'razon_social', width: 32 },
            { header: 'Nombre Comercial *', key: 'nombre_comercial', width: 28 },
            { header: 'RFC *', key: 'rfc', width: 18 },
            { header: 'Correo Electrónico *', key: 'correo', width: 30 },
            { header: 'Teléfono *', key: 'telefono', width: 18 },
            { header: 'Código Postal *', key: 'codigo_postal', width: 16 },
            { header: 'Estado *', key: 'estado', width: 22 },
            { header: 'Municipio / Alcaldía *', key: 'municipio', width: 26 },
            { header: 'Colonia *', key: 'colonia', width: 26 },
            { header: 'Calle *', key: 'calle', width: 30 },
            { header: 'No. Exterior *', key: 'numero_exterior', width: 16 },
            { header: 'No. Interior', key: 'numero_interior', width: 16 },
        ];

        // Estilo de encabezado (Slate 800, texto blanco negrita)
        const headerRow = sheet.getRow(1);
        headerRow.height = 28;
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1E293B' },
            };
            cell.font = {
                name: 'Calibri',
                size: 11,
                bold: true,
                color: { argb: 'FFFFFFFF' },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Fila 2: Datos de ejemplo para guiar al usuario
        const sampleRow = sheet.addRow({
            razon_social: 'EMPRESA DEMO S.A. DE C.V.',
            nombre_comercial: 'Empresa Demo',
            rfc: 'EDE200101ABC',
            correo: 'contacto@empresademo.com',
            telefono: '5512345678',
            codigo_postal: '54000',
            estado: 'Estado de México',
            municipio: 'Tlalnepantla de Baz',
            colonia: 'Centro',
            calle: 'Av. Hidalgo',
            numero_exterior: '123',
            numero_interior: 'Piso 2',
        });

        sampleRow.font = { italic: true, color: { argb: 'FF64748B' } };
        sampleRow.alignment = { vertical: 'middle', horizontal: 'left' };

        const uint8Array = await workbook.xlsx.writeBuffer();
        return Buffer.from(uint8Array);
    }

    // Procesa el archivo Excel de empresas cargado
    async processBulkCompanies(file: Express.Multer.File, activeUser: ActiveUserDto) {
        if (!file) throw new BadRequestException('El archivo de Excel no fue cargado');

        const user = await this.prismaService.auth_user.findUnique({ where: { id: activeUser.id } });
        if (!user) throw new NotFoundException('No se encontró el usuario');
        if (!user.idTenant) throw new BadRequestException('El usuario no tiene un tenant asignado');
        const idTenant = user.idTenant;

        const workbook = new ExcelJS.Workbook();
        try {
            await workbook.xlsx.load(file.buffer as any);
        } catch {
            throw new BadRequestException('El archivo subido no es un archivo Excel válido o está dañado.');
        }

        const sheet = workbook.getWorksheet('Empresas') || workbook.worksheets[0];
        if (!sheet) {
            throw new BadRequestException('El archivo Excel no contiene hojas de trabajo.');
        }

        const errors: { row: number; error: string }[] = [];
        let successCount = 0;
        let totalProcessed = 0;

        // Regex para RFC (Persona Moral: 12 caracteres, Persona Física: 13 caracteres)
        const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        const rowCount = sheet.rowCount;

        for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
            const row = sheet.getRow(rowNumber);

            const rawRazonSocial = row.getCell(1).text?.trim();
            const rawNombreComercial = row.getCell(2).text?.trim();
            const rawRfc = row.getCell(3).text?.trim().toUpperCase();
            const rawCorreo = row.getCell(4).text?.trim().toLowerCase();
            const rawTelefono = row.getCell(5).text?.trim();
            const rawCodigoPostal = row.getCell(6).text?.trim();
            const rawEstado = row.getCell(7).text?.trim();
            const rawMunicipio = row.getCell(8).text?.trim();
            const rawColonia = row.getCell(9).text?.trim();
            const rawCalle = row.getCell(10).text?.trim();
            const rawNumExterior = row.getCell(11).text?.trim();
            const rawNumInterior = row.getCell(12).text?.trim() || '';

            // Si la fila está completamente vacía, se ignora
            if (!rawRazonSocial && !rawNombreComercial && !rawRfc && !rawCorreo) {
                continue;
            }

            totalProcessed++;

            // Validaciones de datos de la empresa
            if (!rawRazonSocial) {
                errors.push({ row: rowNumber, error: 'La Razón Social es obligatoria.' });
                continue;
            }
            if (!rawNombreComercial) {
                errors.push({ row: rowNumber, error: 'El Nombre Comercial es obligatorio.' });
                continue;
            }
            if (!rawRfc) {
                errors.push({ row: rowNumber, error: 'El RFC es obligatorio.' });
                continue;
            }
            if (!rfcRegex.test(rawRfc)) {
                errors.push({ row: rowNumber, error: `El RFC "${rawRfc}" no cumple con el formato fiscal válido (12 o 13 caracteres).` });
                continue;
            }
            if (!rawCorreo || !emailRegex.test(rawCorreo)) {
                errors.push({ row: rowNumber, error: `El correo "${rawCorreo || ''}" no tiene un formato válido.` });
                continue;
            }
            if (!rawTelefono) {
                errors.push({ row: rowNumber, error: 'El teléfono es obligatorio.' });
                continue;
            }

            // Validaciones de domicilio fiscal
            if (!rawCodigoPostal) {
                errors.push({ row: rowNumber, error: 'El Código Postal es obligatorio.' });
                continue;
            }
            if (!rawEstado) {
                errors.push({ row: rowNumber, error: 'El Estado es obligatorio.' });
                continue;
            }
            if (!rawMunicipio) {
                errors.push({ row: rowNumber, error: 'El Municipio o Alcaldía es obligatorio.' });
                continue;
            }
            if (!rawColonia) {
                errors.push({ row: rowNumber, error: 'La Colonia es obligatoria.' });
                continue;
            }
            if (!rawCalle) {
                errors.push({ row: rowNumber, error: 'La Calle es obligatoria.' });
                continue;
            }
            if (!rawNumExterior) {
                errors.push({ row: rowNumber, error: 'El Número Exterior es obligatorio.' });
                continue;
            }

            // Validar si el RFC ya existe en este tenant
            const exists = await this.prismaService.catEmpresas.findFirst({
                where: {
                    rfc: rawRfc,
                    idTenant: idTenant,
                },
                select: { idEmpresa: true },
            });

            if (exists) {
                errors.push({ row: rowNumber, error: `El RFC ${rawRfc} ya se encuentra registrado.` });
                continue;
            }

            // Inserción transaccional de Empresa y Domicilio
            try {
                await this.prismaService.$transaction(async (tx) => {
                    const nuevaEmpresa = await tx.catEmpresas.create({
                        data: {
                            idTenant: idTenant,
                            razon_social: rawRazonSocial,
                            nombre_comercial: rawNombreComercial,
                            correo: rawCorreo,
                            telefono: rawTelefono,
                            rfc: rawRfc,
                            logo_empresa: null,
                            usuarioRegistro: user.uuid,
                        },
                    });

                    await tx.domicilioEmpresas.create({
                        data: {
                            idEmpresa: nuevaEmpresa.idEmpresa,
                            idTenant: idTenant,
                            codigo_postal: rawCodigoPostal,
                            idColonia: 0,
                            colonia: rawColonia,
                            municipio: rawMunicipio,
                            estado: rawEstado,
                            calle: rawCalle,
                            numero_exterior: rawNumExterior,
                            numero_interior: rawNumInterior,
                            usuarioRegistro: user.uuid,
                        },
                    });
                    // SEMBRADO DE DOCUMENTOS BASE por empresa
                    await seedDocumentosEmpresa(tx, {
                        idTenant: idTenant,
                        idEmpresa: nuevaEmpresa.idEmpresa,
                        usuarioRegistro: user.uuid || 'system_seed',
                    });
                });

                successCount++;
            } catch (err: any) {
                errors.push({
                    row: rowNumber,
                    error: err?.message || 'Error inesperado al guardar la empresa en base de datos.',
                });
            }
        }

        return {
            message: `Carga masiva completada: ${successCount} empresas creadas exitosamente.`,
            successCount,
            totalProcessed,
            errors,
        };
    }
}
