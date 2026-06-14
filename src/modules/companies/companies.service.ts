import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import * as fs from 'fs';
import * as path from 'path';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
    constructor(private prismaService: PrismaService) { }

    private readonly logger = new Logger(CompaniesService.name);

    async findAll(page: number, query: string, limit: number) {
        const skip = (page - 1) * limit;

        const whereCondition: any = {};

        if (query) {
            whereCondition.OR = [
                { nombre_comercial: { contains: query } },
                { rfc: { contains: query } },
            ];
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

    async findOne(id: string) {
        const company = await this.prismaService.catEmpresas.findUnique({
            where: { idEmpresa: Number(id) },
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

    async create(dto: CreateCompanyDto, file: Express.Multer.File, activeUser: ActiveUserDto) {
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
                const baseMediaFolder = path.resolve(process.cwd(), 'media');
                const absoluteFolder = path.join(baseMediaFolder, folderName, 'logo');
                const absolutePath = path.join(absoluteFolder, logoName);

                if (!absolutePath.startsWith(baseMediaFolder)) throw new BadRequestException('Path Injection is not allowed.');

                fs.mkdirSync(absoluteFolder, { recursive: true });
                fs.writeFileSync(absolutePath, file.buffer);
                logoPath = `/media/${folderName}/logo/${logoName}`;
            } catch (fileError) {
                if (fileError instanceof BadRequestException) throw fileError;
                throw new InternalServerErrorException(`Failed to save logo file: ${fileError.message}`);
            }
        }

        const user = await this.prismaService.auth_user.findUnique({ where: { id: activeUser.id } });
        if (!user) throw new NotFoundException('No se encontró el usuario');

        try {
            await this.prismaService.$transaction(async (tx) => {
                const nuevaEmpresa = await tx.catEmpresas.create({
                    data: {
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
            });

            return { success: true, message: 'Company created successfully' };
        } catch (dbError) {
            throw new InternalServerErrorException(`Database transaction failed: ${dbError.message}`);
        }
    }

    async update(id: string, dto: UpdateCompanyDto, file: Express.Multer.File, activeUser: ActiveUserDto) {
        const user = await this.prismaService.auth_user.findUnique({ where: { id: activeUser.id } });
        if (!user) throw new NotFoundException('No se encontró el usuario');

        const idEmpresa = Number(id);
        const companyExists = await this.prismaService.catEmpresas.findUnique({
            where: { idEmpresa },
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

                const baseMediaFolder = path.resolve(process.cwd(), 'media');
                const absoluteFolder = path.join(baseMediaFolder, folderName, 'logo');
                const absolutePath = path.join(absoluteFolder, logoName);

                if (!absolutePath.startsWith(baseMediaFolder)) throw new BadRequestException('Intento de Path Injection detectado.');

                fs.mkdirSync(absoluteFolder, { recursive: true });
                fs.writeFileSync(absolutePath, file.buffer);
                logoPath = `/media/${folderName}/logo/${logoName}`;
            } catch (fileError) {
                if (fileError instanceof BadRequestException) throw fileError;
                throw new InternalServerErrorException(`Failed to save logo file: ${fileError.message}`);
            }
        }

        try {
            await this.prismaService.$transaction(async (tx) => {
                await tx.catEmpresas.update({
                    where: { idEmpresa },
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
                            ...datosDomicilio,
                        },
                    });
                }
            });
            return { message: 'Empresa actualizada correctamente' };
        } catch (dbError) {
            this.logger.error(`Error al actualizar la empresa: ${dbError.message}`);
            throw new InternalServerErrorException(`Error al actualizar la empresa`);
        }
    }

    async changeStatus(id: string, active: boolean, user: ActiveUserDto) {
        const userRecord = await this.prismaService.auth_user.findUnique({ where: { id: user.id } });
        if (!userRecord) throw new NotFoundException('No se encontró el usuario');

        const idEmpresa = Number(id);
        await this.prismaService.catEmpresas.update({
            where: { idEmpresa },
            data: {
                activo: active,
                usuarioRegistro: userRecord.uuid
            },
        });

        return {
            message: active ? 'Empresa activada correctamente' : 'Empresa desactivada correctamente'
        };
    }
}
