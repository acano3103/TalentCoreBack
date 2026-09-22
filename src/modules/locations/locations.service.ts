import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import * as ExcelJS from 'exceljs';

@Injectable()
export class LocationsService {
    private readonly logger = new Logger(LocationsService.name);

    constructor(private prismaService: PrismaService) { }

    // Obtiene todas las ubicaciones de una empresa
    async findAll(
        companyId: number,
        page: number,
        query: string,
        limit: number,
        user: ActiveUserDto,
        operatingUnitId?: number | null
    ) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const pageNumber = Math.max(1, Number(page) || 1);
        const limitNumber = Math.max(1, Number(limit) || 10);
        const skip = (pageNumber - 1) * limitNumber;

        const whereCondition: any = {
            idEmpresa: Number(companyId),
            idTenant: user.idTenant,
            ...(operatingUnitId ? { idUnidadOperativa: Number(operatingUnitId) } : {}),
        };

        if (query) {
            whereCondition.OR = [
                { Descripcion: { contains: query } },
                { Estado: { contains: query } },
                { MunicipioDelegacion: { contains: query } },
                { Colonia: { contains: query } },
                { Calle: { contains: query } },
                { CodigoPostal: { contains: query } },
            ];
        }

        const [sites, total] = await Promise.all([
            this.prismaService.catSites.findMany({
                where: whereCondition,
                skip: skip,
                take: limitNumber,
                orderBy: { idSite: 'desc' },
            }),
            this.prismaService.catSites.count({ where: whereCondition }),
        ]);

        if ((!sites || sites.length === 0) && pageNumber === 1 && !query && !operatingUnitId) {
            return {
                locations: [],
                total: 0,
                currentPage: pageNumber,
                totalPages: 1,
            };
        }

        return {
            locations: sites,
            total,
            currentPage: pageNumber,
            totalPages: Math.ceil(total / limitNumber) || 1,
        };
    }

    // Obtiene una ubicación por ID
    async getLocationById(companyId: number, locationId: number, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        // Buscamos la ubicación verificando tenant y empresa
        const location = await this.prismaService.catSites.findFirst({
            where: {
                idSite: locationId,
                idEmpresa: companyId,
                idTenant: user.idTenant,
            },
            include: {
                // Relación a los DIDs activos de la sucursal
                CatSitesDids: {
                    where: { Activo: true },
                    select: {
                        idSiteDid: true,
                        Did: true,
                        Descripcion: true,
                        Activo: true,
                    },
                },
            },
        });

        if (!location) {
            throw new NotFoundException('La ubicación especificada no existe.');
        }

        // Extraemos la lista en un array plano para el formulario del frontend
        const dids = location.CatSitesDids?.map((item: any) => item.Did) || [];

        return {
            ...location,
            dids,
        };
    }

    // Crea una nueva ubicación
    async create(companyId: number, dto: CreateLocationDto, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant;

        const companyExists = await this.prismaService.catEmpresas.findUnique({
            where: { idEmpresa: companyId, idTenant: user.idTenant },
        });
        if (!companyExists) throw new NotFoundException('La empresa especificada no existe.');

        // Si enviaron unidad operativa, validamos que exista y pertenezca a la empresa
        if (dto.idUnidadOperativa) {
            const operatingUnitExists = await this.prismaService.catUnidadesOperativas.findFirst({
                where: {
                    idUnidadOperativa: dto.idUnidadOperativa,
                    idEmpresa: companyId,
                },
            });
            if (!operatingUnitExists) {
                throw new NotFoundException('La unidad operativa especificada no existe para esta empresa.');
            }
        }

        try {
            const newSite = await this.prismaService.$transaction(async (tx: any) => {
                const site = await tx.catSites.create({
                    data: {
                        idEmpresa: companyId,
                        idTenant,
                        idTipoUbicacion: dto.idTipoUbicacion,
                        idUnidadOperativa: dto.idUnidadOperativa || null,
                        Descripcion: dto.descripcion,
                        EsPrincipal: dto.esPrincipal === 1,
                        CodigoPostal: dto.codigoPostal,
                        Colonia: dto.colonia,
                        MunicipioDelegacion: dto.municipio,
                        Estado: dto.estado,
                        Calle: dto.calle,
                        NoExterior: dto.noExt,
                        NoInterior: dto.noInt || null,
                        Pais: dto.pais,
                        Latitud: dto.latitud,
                        Longitud: dto.longitud,
                        idRegistroPatronal: dto.idRegistroPatronal || null,
                        ZonaFronteriza: dto.zonaFronteriza === 1,
                        TipoAsistencia: dto.tipoAsistencia || null,
                        Activo: true,
                        FechaRegistro: new Date(),
                    },
                });

                // Inserción de DIDs autorizados (solo si el método elegido es IVR)
                const didsModel = tx.catSitesDids || tx.CatSitesDids;
                const cleanDids = dto.tipoAsistencia === 'IVR' ? (dto.dids || []).filter(Boolean) : [];

                if (didsModel && cleanDids.length > 0) {
                    await didsModel.createMany({
                        data: cleanDids.map((numero: string) => ({
                            idTenant,
                            idEmpresa: companyId,
                            idSite: site.idSite,
                            Did: numero.trim(),
                            Activo: true,
                            FechaRegistro: new Date(),
                        })),
                    });
                }

                const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `Usuario #${user.id}`;
                const historyModel = tx.historicoMovimientos || tx.HistoricoMovimientos;

                if (historyModel) {
                    const asistenciaDesc = dto.tipoAsistencia ? ` (Método: ${dto.tipoAsistencia})` : ' (Sin asistencia)';
                    await historyModel.create({
                        data: {
                            idUsuario: user.id,
                            idEmpresa: companyId,
                            accion: 'CREAR',
                            tablaOrigen: 'CatSites',
                            idRegistro: String(site.idSite),
                            descripcion: `Ubicación "${site.Descripcion}" creada por ${userFullName}${asistenciaDesc}${cleanDids.length ? ` con ${cleanDids.length} DID(s)` : ''}`,
                            fechaCreacion: new Date(),
                        },
                    });
                }

                return {
                    ...site,
                    dids: cleanDids,
                };
            });

            return {
                success: true,
                message: 'Ubicación creada correctamente',
                data: newSite,
            };
        } catch (error) {
            this.logger.error(`Error al crear la ubicación: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error interno al registrar la ubicación.');
        }
    }

    // Actualiza una ubicación por ID
    async update(companyId: number, locationId: number, dto: UpdateLocationDto, user: ActiveUserDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant;

        const locationExists = await this.prismaService.catSites.findFirst({
            where: {
                idSite: locationId,
                idEmpresa: companyId,
                idTenant,
            },
        });

        if (!locationExists) {
            throw new NotFoundException('La ubicación especificada no existe para esta empresa.');
        }

        if (dto.idUnidadOperativa) {
            const operatingUnitExists = await this.prismaService.catUnidadesOperativas.findFirst({
                where: {
                    idUnidadOperativa: dto.idUnidadOperativa,
                    idEmpresa: companyId,
                },
            });
            if (!operatingUnitExists) {
                throw new NotFoundException('La unidad operativa especificada no existe para esta empresa.');
            }
        }

        try {
            const updatedSite = await this.prismaService.$transaction(async (tx: any) => {
                const site = await tx.catSites.update({
                    where: { idSite: locationId },
                    data: {
                        Descripcion: dto.descripcion,
                        idTipoUbicacion: dto.idTipoUbicacion,
                        idUnidadOperativa: dto.idUnidadOperativa !== undefined ? (dto.idUnidadOperativa || null) : undefined,
                        EsPrincipal: dto.esPrincipal !== undefined ? dto.esPrincipal === 1 : undefined,
                        CodigoPostal: dto.codigoPostal,
                        Estado: dto.estado,
                        MunicipioDelegacion: dto.municipio,
                        Colonia: dto.colonia,
                        Calle: dto.calle,
                        NoExterior: dto.noExt,
                        NoInterior: dto.noInt || null,
                        Pais: dto.pais,
                        Latitud: dto.latitud,
                        Longitud: dto.longitud,
                        idRegistroPatronal: dto.idRegistroPatronal !== undefined ? (dto.idRegistroPatronal || null) : undefined,
                        ZonaFronteriza: dto.zonaFronteriza !== undefined ? dto.zonaFronteriza === 1 : undefined,
                        TipoAsistencia: dto.tipoAsistencia !== undefined ? (dto.tipoAsistencia || null) : undefined,
                    },
                });

                // Sincronización de DIDs según el TipoAsistencia actual o enviado
                const didsModel = tx.catSitesDids || tx.CatSitesDids;
                let finalDids: string[] = [];

                if (didsModel) {
                    const resolvedTipoAsistencia = dto.tipoAsistencia !== undefined ? dto.tipoAsistencia : site.TipoAsistencia;

                    // Si el método no es IVR (es BIOMETRICO, APP_MOVIL o null), eliminamos DIDs existentes
                    if (resolvedTipoAsistencia !== 'IVR') {
                        await didsModel.deleteMany({
                            where: { idSite: locationId },
                        });
                        finalDids = [];
                    } else if (Array.isArray(dto.dids)) {
                        // Si es IVR y enviaron la lista de DIDs, sincronizamos
                        const cleanDids = dto.dids.map((d: string) => d.trim()).filter(Boolean);
                        finalDids = cleanDids;

                        // 1. Eliminar los que ya no vienen en la lista
                        await didsModel.deleteMany({
                            where: {
                                idSite: locationId,
                                Did: { notIn: cleanDids },
                            },
                        });

                        // 2. Insertar los nuevos evitando duplicados
                        if (cleanDids.length > 0) {
                            await didsModel.createMany({
                                data: cleanDids.map((numero: string) => ({
                                    idTenant,
                                    idEmpresa: companyId,
                                    idSite: locationId,
                                    Did: numero,
                                    Activo: true,
                                    FechaRegistro: new Date(),
                                })),
                                skipDuplicates: true,
                            });
                        }
                    } else {
                        // Si es IVR pero no enviaron el campo dids, conservamos los existentes para el retorno
                        const existing = await didsModel.findMany({
                            where: { idSite: locationId, Activo: true },
                            select: { Did: true },
                        });
                        finalDids = existing.map((e: any) => e.Did);
                    }
                }

                const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `Usuario #${user.id}`;
                const historyModel = tx.historicoMovimientos || tx.HistoricoMovimientos;

                if (historyModel) {
                    await historyModel.create({
                        data: {
                            idUsuario: user.id,
                            idEmpresa: companyId,
                            accion: 'EDITAR',
                            tablaOrigen: 'CatSites',
                            idRegistro: String(locationId),
                            descripcion: `Ubicación "${site.Descripcion}" actualizada por ${userFullName}`,
                            fechaCreacion: new Date(),
                        },
                    });
                }

                return {
                    ...site,
                    dids: finalDids,
                };
            });

            return {
                success: true,
                message: 'Ubicación actualizada correctamente',
                data: updatedSite,
            };
        } catch (error) {
            this.logger.error(`Error al actualizar la ubicación ${locationId}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error interno al intentar guardar los cambios de la ubicación.');
        }
    }

    // Actualiza el estatus de una ubicación
    async changeStatus(companyId: number, id: number, active: boolean, user: ActiveUserDto) {
        if (!user.idTenant) {          // <-- nuevo
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        const idTenant = user.idTenant;   // <-- nuevo

        const locationExists = await this.prismaService.catSites.findFirst({
            where: {
                idSite: id,
                idEmpresa: companyId,
                idTenant,   // <-- nuevo
            },
        });

        if (!locationExists) {
            throw new NotFoundException('La ubicación especificada no existe para esta empresa.');
        }

        try {
            await this.prismaService.$transaction(async (tx: any) => {
                await tx.catSites.update({
                    where: { idSite: id, idEmpresa: companyId },   // idTenant ya validado en el findFirst de arriba
                    data: {
                        Activo: active,
                    },
                });

                const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `Usuario #${user.id}`;
                const historyModel = tx.historicoMovimientos || tx.HistoricoMovimientos;

                if (historyModel) {
                    await historyModel.create({
                        data: {
                            idUsuario: user.id,
                            idEmpresa: companyId,
                            accion: active ? 'REACTIVAR' : 'DESACTIVAR',
                            tablaOrigen: 'CatSites',
                            idRegistro: String(id),
                            descripcion: `Ubicación "${locationExists.Descripcion}" ${active ? 'reactivada' : 'desactivada'} por ${userFullName}`,
                            fechaCreacion: new Date(),
                        },
                    });
                }
            });

            return {
                success: true,
                message: active ? 'Ubicación activada correctamente' : 'Ubicación desactivada correctamente',
            };
        } catch (error) {
            this.logger.error(`Error al cambiar estatus de la ubicación ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error al actualizar el estatus de la ubicación');
        }
    }

    // Genera una plantilla masiva de ubicaciones, registros patronales y unidades operativas
    async generateBulkTemplate(companyId: number, activeUser: ActiveUserDto): Promise<Buffer> {
        if (!activeUser.idTenant) throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');

        // Consultar Registros Patronales, Unidades, Tipos de Ubicación y Datos de la Empresa
        const [empresa, registrosExistentes, unidadesExistentes, tiposUbicacion] = await Promise.all([
            this.prismaService.catEmpresas.findUnique({
                where: { idEmpresa: companyId, idTenant: activeUser.idTenant },
                select: { razon_social: true, nombre_comercial: true },
            }),
            this.prismaService.catRegistrosPatronales.findMany({
                where: { idEmpresa: companyId, idTenant: activeUser.idTenant, Activo: true },
                select: { RegistroPatronal: true, RazonSocial: true, ClaseRiesgo: true, PrimaRiesgo: true },
                orderBy: { RegistroPatronal: 'asc' },
            }),
            this.prismaService.catUnidadesOperativas.findMany({
                where: { idEmpresa: companyId, idTenant: activeUser.idTenant, Activo: true },
                select: { Codigo: true, Nombre: true, Descripcion: true, EsExterna: true },
                orderBy: { Nombre: 'asc' },
            }),
            this.prismaService.catTiposUbicacion.findMany({
                where: { Activo: true },
                select: { idTipoUbicacion: true, Codigo: true, Descripcion: true },
                orderBy: { idTipoUbicacion: 'asc' },
            }),
        ]);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Talent Core';
        workbook.created = new Date();

        const styleHeader = (row: ExcelJS.Row, colorHex: string = 'FF1E293B') => {
            row.height = 28;
            row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorHex } };
                cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });
        };

        const cleanDecimalValue = (val: any): number => {
            if (val === null || val === undefined) return 0.54355;
            const strVal = String(val).replace(/["'\s]/g, '').trim();
            const num = parseFloat(strVal);
            return isNaN(num) ? 0.54355 : num;
        };

        // ── HOJA 0: CATÁLOGOS DEL SISTEMA (OCULTA) ──
        const sheetCat = workbook.addWorksheet('Catalogos');
        sheetCat.state = 'veryHidden';
        sheetCat.getCell('A1').value = 'TiposUbicacion';
        tiposUbicacion.forEach((t, idx) => {
            sheetCat.getCell(`A${idx + 2}`).value = t.Descripcion;
        });
        const totalTiposUbicacion = tiposUbicacion.length;

        // ── HOJA 1: REGISTROS PATRONALES ──
        const sheetRP = workbook.addWorksheet('Registros Patronales');
        sheetRP.columns = [
            { header: 'Registro Patronal (11 dígitos) *', key: 'rp', width: 30 },
            { header: 'Razón Social / Empresa *', key: 'razonSocial', width: 35 },
            { header: 'Clase de Riesgo (Clase I a V) *', key: 'claseRiesgo', width: 30 },
            { header: 'Prima de Riesgo (%) *', key: 'primaRiesgo', width: 22, style: { numFmt: '0.00000' } },
        ];
        styleHeader(sheetRP.getRow(1), 'FF7C3AED'); // Violeta

        registrosExistentes.forEach((rp) => {
            sheetRP.addRow({
                rp: String(rp.RegistroPatronal || '').replace(/["'\s]/g, '').trim(),
                razonSocial: String(rp.RazonSocial || '').replace(/["']/g, '').trim(),
                claseRiesgo: String(rp.ClaseRiesgo || '').replace(/["']/g, '').trim(),
                primaRiesgo: cleanDecimalValue(rp.PrimaRiesgo),
            });
        });

        if (registrosExistentes.length === 0) {
            const sampleRP = sheetRP.addRow({
                rp: 'Y6412345101',
                razonSocial: empresa?.razon_social || 'EMPRESA DEMO S.A. DE C.V.',
                claseRiesgo: 'Clase I',
                primaRiesgo: 0.54355,
            });
            sampleRP.font = { italic: true, color: { argb: 'FF64748B' } };
        }

        // ── HOJA 2: UNIDADES OPERATIVAS ──
        const sheetUO = workbook.addWorksheet('Unidades Operativas');
        sheetUO.columns = [
            { header: 'Código *', key: 'codigo', width: 20 },
            { header: 'Nombre de la Unidad *', key: 'nombre', width: 35 },
            { header: 'Descripción', key: 'descripcion', width: 35 },
            { header: '¿Es Externa? (SI / NO) *', key: 'esExterna', width: 24 },
            { header: 'Responsable Contacto', key: 'responsable', width: 28 },
            { header: 'Teléfono Contacto', key: 'telefono', width: 20 },
            { header: 'Correo Contacto', key: 'correo', width: 30 },
        ];
        styleHeader(sheetUO.getRow(1), 'FF2563EB'); // Azul

        unidadesExistentes.forEach((uo) => {
            sheetUO.addRow({
                codigo: uo.Codigo || '',
                nombre: uo.Nombre,
                descripcion: uo.Descripcion || '',
                esExterna: uo.EsExterna ? 'SI' : 'NO',
                responsable: '',
                telefono: '',
                correo: '',
            });
        });

        if (unidadesExistentes.length === 0) {
            const sampleUO = sheetUO.addRow({
                codigo: 'UO-CORP',
                nombre: 'Operaciones y Desarrollo',
                descripcion: 'Unidad encargada de corporativo central',
                esExterna: 'NO',
                responsable: 'Lic. Juan Pérez',
                telefono: '5512345678',
                correo: 'operaciones@empresa.com',
            });
            sampleUO.font = { italic: true, color: { argb: 'FF64748B' } };
        }

        // ── HOJA 3: UBICACIONES (CENTROS DE TRABAJO) ──
        const sheetSites = workbook.addWorksheet('Ubicaciones');
        sheetSites.columns = [
            { header: 'Nombre de la Ubicación *', key: 'descripcion', width: 30 },
            { header: 'Tipo de Ubicación *', key: 'tipoUbicacion', width: 32 }, // 👈 Columna nueva (Columna B)
            { header: '¿Es Sede Principal? (SI / NO) *', key: 'esPrincipal', width: 28 },
            { header: 'Registro Patronal Asignado *', key: 'registroPatronal', width: 32 },
            { header: 'Unidad Operativa (Opcional)', key: 'unidadOperativa', width: 32 },
            { header: 'Método Asistencia (IVR / BIOMETRICO / APP_MOVIL)', key: 'tipoAsistencia', width: 44 },
            { header: 'Código Postal *', key: 'codigoPostal', width: 16 },
            { header: 'Estado *', key: 'estado', width: 22 },
            { header: 'Municipio / Delegación *', key: 'municipio', width: 26 },
            { header: 'Colonia *', key: 'colonia', width: 26 },
            { header: 'Calle *', key: 'calle', width: 30 },
            { header: 'No. Exterior *', key: 'noExt', width: 16 },
            { header: 'No. Interior', key: 'noInt', width: 16 },
            { header: 'País *', key: 'pais', width: 16 },
            { header: 'Zona Fronteriza (SI / NO)', key: 'zonaFronteriza', width: 25 },
        ];
        styleHeader(sheetSites.getRow(1), 'FF0D9488'); // Teal

        const primerRP = registrosExistentes[0]?.RegistroPatronal
            ? String(registrosExistentes[0].RegistroPatronal).replace(/["'\s]/g, '').trim()
            : 'Y6412345101';

        const sampleSite = sheetSites.addRow({
            descripcion: 'CORPORATIVO CENTRAL',
            tipoUbicacion: tiposUbicacion[0]?.Descripcion || 'CORPORATIVO / OFICINA PRINCIPAL',
            esPrincipal: 'SI',
            registroPatronal: primerRP,
            unidadOperativa: unidadesExistentes[0]?.Nombre || 'Operaciones y Desarrollo',
            tipoAsistencia: 'APP_MOVIL',
            codigoPostal: '01210',
            estado: 'Ciudad de México',
            municipio: 'Álvaro Obregón',
            colonia: 'Santa Fe',
            calle: 'Av. Prolongación Paseo de la Reforma',
            noExt: '1200',
            noInt: 'Piso 5',
            pais: 'México',
            zonaFronteriza: 'NO',
        });
        sampleSite.font = { italic: true, color: { argb: 'FF64748B' } };

        // Validaciones desplegables en cascada
        for (let row = 2; row <= 300; row++) {
            // Columna B: Tipo de Ubicación (Apunta a hoja Catalogos)
            if (totalTiposUbicacion > 0) {
                sheetSites.getCell(`B${row}`).dataValidation = {
                    type: 'list',
                    allowBlank: false,
                    formulae: [`Catalogos!$A$2:$A$${totalTiposUbicacion + 1}`],
                    showErrorMessage: true,
                    errorTitle: 'Tipo de Ubicación inválido',
                    error: 'Selecciona un Tipo de Ubicación válido de la lista.',
                };
            }

            // Columna C: ¿Es Principal?
            sheetSites.getCell(`C${row}`).dataValidation = {
                type: 'list',
                allowBlank: false,
                formulae: ['"SI,NO"'],
            };

            // Columna D: Registro Patronal (Apunta a la Hoja Registros Patronales)
            sheetSites.getCell(`D${row}`).dataValidation = {
                type: 'list',
                allowBlank: false,
                formulae: ["'Registros Patronales'!$A$2:$A$100"],
                showErrorMessage: true,
                errorTitle: 'Registro Patronal inválido',
                error: 'Selecciona un Registro Patronal cargado en la primera pestaña.',
            };

            // Columna E: Unidad Operativa (Apunta a Unidades Operativas)
            sheetSites.getCell(`E${row}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: ["'Unidades Operativas'!$B$2:$B$100"],
                showErrorMessage: true,
                errorTitle: 'Unidad Operativa inválida',
                error: 'Selecciona una Unidad Operativa de la segunda pestaña.',
            };

            // Columna F: Tipo Asistencia
            sheetSites.getCell(`F${row}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: ['"IVR,BIOMETRICO,APP_MOVIL"'],
            };

            // Columna O: Zona Fronteriza
            sheetSites.getCell(`O${row}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: ['"SI,NO"'],
            };
        }

        const uint8Array = await workbook.xlsx.writeBuffer();
        return Buffer.from(uint8Array);
    }

    // Procesa un archivo masivo de ubicaciones, registros patronales y unidades operativas
    async processBulkLocations(companyId: number, file: Express.Multer.File, activeUser: ActiveUserDto) {
        if (!activeUser.idTenant) throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        const idTenant = activeUser.idTenant;

        const companyExists = await this.prismaService.catEmpresas.findUnique({
            where: { idEmpresa: companyId, idTenant },
            select: { idEmpresa: true, razon_social: true },
        });
        if (!companyExists) throw new NotFoundException('La empresa especificada no existe.');

        const workbook = new ExcelJS.Workbook();
        try {
            await workbook.xlsx.load(file.buffer as any);
        } catch {
            throw new BadRequestException('El archivo Excel es inválido o está dañado.');
        }

        const sheetRP = workbook.getWorksheet('Registros Patronales') || workbook.worksheets[0];
        const sheetUO = workbook.getWorksheet('Unidades Operativas') || workbook.worksheets[1];
        const sheetSites = workbook.getWorksheet('Ubicaciones') || workbook.worksheets[2];

        if (!sheetSites) throw new BadRequestException('El archivo debe contener al menos la hoja "Ubicaciones".');

        const errors: { row: number; error: string }[] = [];
        let createdRP = 0;
        let createdUO = 0;
        let createdSites = 0;

        // Mapas para resolver referencias FK por texto
        const rpMap = new Map<string, number>(); // ClaveRP (uppercase) -> idRegistroPatronal
        const uoMap = new Map<string, number>(); // NombreUO (lowercase) -> idUnidadOperativa

        // Precargar registros, unidades y tipos de ubicación existentes
        const [existingRPs, existingUOs, tiposUbicacion] = await Promise.all([
            this.prismaService.catRegistrosPatronales.findMany({
                where: { idEmpresa: companyId, idTenant },
                select: { idRegistroPatronal: true, RegistroPatronal: true },
            }),
            this.prismaService.catUnidadesOperativas.findMany({
                where: { idEmpresa: companyId, idTenant },
                select: { idUnidadOperativa: true, Nombre: true },
            }),
            this.prismaService.catTiposUbicacion.findMany({
                where: { Activo: true },
                select: { idTipoUbicacion: true, Descripcion: true },
            }),
        ]);

        existingRPs.forEach((rp) => rpMap.set(rp.RegistroPatronal.replace(/["'\s]/g, '').toUpperCase().trim(), rp.idRegistroPatronal));
        existingUOs.forEach((uo) => uoMap.set(uo.Nombre.toLowerCase().trim(), uo.idUnidadOperativa));

        const tipoUbicacionMap = new Map<string, number>();
        tiposUbicacion.forEach((t) => {
            tipoUbicacionMap.set(t.Descripcion.toLowerCase().trim(), t.idTipoUbicacion);
        });
        const fallbackTipoId = tiposUbicacion[0]?.idTipoUbicacion || 1;

        // ─────────────────────────────────────────────────────────────
        // PASO 1: PROCESAR HOJA DE REGISTROS PATRONALES
        // ─────────────────────────────────────────────────────────────
        if (sheetRP) {
            for (let rowNumber = 2; rowNumber <= sheetRP.rowCount; rowNumber++) {
                const row = sheetRP.getRow(rowNumber);
                const rawRP = row.getCell(1).text?.replace(/["'\s]/g, '').trim().toUpperCase();
                const rawRazonSocial = row.getCell(2).text?.replace(/["']/g, '').trim() || companyExists.razon_social;
                const rawClase = row.getCell(3).text?.replace(/["']/g, '').trim();
                const rawPrima = row.getCell(4).text?.replace(/["'\s]/g, '').trim();

                if (!rawRP) continue;

                const primaLimpia = (!rawPrima || isNaN(Number(rawPrima))) ? '0.54355' : rawPrima;

                if (!rpMap.has(rawRP)) {
                    try {
                        const nuevoRP = await this.prismaService.catRegistrosPatronales.create({
                            data: {
                                idEmpresa: companyId,
                                idTenant,
                                RegistroPatronal: rawRP,
                                RazonSocial: rawRazonSocial.toUpperCase().trim(),
                                ClaseRiesgo: rawClase || 'Clase I',
                                PrimaRiesgo: primaLimpia,
                                Activo: true,
                            },
                        });
                        rpMap.set(rawRP, nuevoRP.idRegistroPatronal);
                        createdRP++;
                    } catch (err: any) {
                        errors.push({
                            row: rowNumber,
                            error: `[Reg. Patronal ${rawRP}]: ${err.message || 'Error al registrar'}`,
                        });
                    }
                }
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PASO 2: PROCESAR HOJA DE UNIDADES OPERATIVAS
        // ─────────────────────────────────────────────────────────────
        if (sheetUO) {
            for (let rowNumber = 2; rowNumber <= sheetUO.rowCount; rowNumber++) {
                const row = sheetUO.getRow(rowNumber);
                const rawCodigo = row.getCell(1).text?.replace(/["']/g, '').trim().toUpperCase();
                const rawNombre = row.getCell(2).text?.replace(/["']/g, '').trim();
                const rawDesc = row.getCell(3).text?.replace(/["']/g, '').trim() || null;
                const rawEsExterna = row.getCell(4).text?.replace(/["']/g, '').trim().toUpperCase() === 'SI';
                const rawResp = row.getCell(5).text?.replace(/["']/g, '').trim() || null;
                const rawTel = row.getCell(6).text?.replace(/["']/g, '').trim() || null;
                const rawCorreo = row.getCell(7).text?.replace(/["']/g, '').trim() || null;

                if (!rawNombre) continue;

                const normalizedNombre = rawNombre.toLowerCase().trim();
                if (!uoMap.has(normalizedNombre)) {
                    try {
                        const nuevaUO = await this.prismaService.catUnidadesOperativas.create({
                            data: {
                                idEmpresa: companyId,
                                idTenant,
                                Codigo: rawCodigo || null,
                                Nombre: rawNombre,
                                Descripcion: rawDesc,
                                EsExterna: rawEsExterna,
                                ResponsableContacto: rawResp,
                                TelefonoContacto: rawTel,
                                CorreoContacto: rawCorreo,
                                Activo: true,
                            },
                        });
                        uoMap.set(normalizedNombre, nuevaUO.idUnidadOperativa);
                        createdUO++;
                    } catch (err: any) {
                        errors.push({
                            row: rowNumber,
                            error: `[Unidad ${rawNombre}]: ${err.message || 'Error al registrar'}`,
                        });
                    }
                }
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PASO 3: PROCESAR HOJA DE UBICACIONES
        // ─────────────────────────────────────────────────────────────
        const userFullName = `${activeUser.first_name || ''} ${activeUser.last_name || ''}`.trim() || `Usuario #${activeUser.id}`;

        for (let rowNumber = 2; rowNumber <= sheetSites.rowCount; rowNumber++) {
            const row = sheetSites.getRow(rowNumber);

            const descripcion = row.getCell(1).text?.replace(/["']/g, '').trim();
            const rawTipoUbicacion = row.getCell(2).text?.replace(/["']/g, '').toLowerCase().trim(); // Columna B
            const esPrincipal = row.getCell(3).text?.replace(/["']/g, '').trim().toUpperCase() === 'SI'; // Columna C
            const rawRP = row.getCell(4).text?.replace(/["'\s]/g, '').trim().toUpperCase();            // Columna D
            const rawUO = row.getCell(5).text?.replace(/["']/g, '').trim().toLowerCase();            // Columna E
            let tipoAsistencia = row.getCell(6).text?.replace(/["']/g, '').trim().toUpperCase() as any; // Columna F
            const codigoPostal = row.getCell(7).text?.replace(/["']/g, '').trim();
            const estado = row.getCell(8).text?.replace(/["']/g, '').trim();
            const municipio = row.getCell(9).text?.replace(/["']/g, '').trim();
            const colonia = row.getCell(10).text?.replace(/["']/g, '').trim();
            const calle = row.getCell(11).text?.replace(/["']/g, '').trim();
            const noExt = row.getCell(12).text?.replace(/["']/g, '').trim();
            const noInt = row.getCell(13).text?.replace(/["']/g, '').trim() || null;
            const pais = row.getCell(14).text?.replace(/["']/g, '').trim() || 'México';
            const zonaFronteriza = row.getCell(15).text?.replace(/["']/g, '').trim().toUpperCase() === 'SI';

            // Si la fila está vacía, la omitimos
            if (!descripcion && !codigoPostal && !calle) continue;

            // Validaciones obligatorias de ubicación
            if (!descripcion) {
                errors.push({ row: rowNumber, error: '[Ubicaciones]: El nombre de la ubicación es obligatorio.' });
                continue;
            }

            // Alerta defensiva si las columnas quedaron corridas
            if (rawRP === 'SI' || rawRP === 'NO') {
                errors.push({
                    row: rowNumber,
                    error: `[Ubicación ${descripcion}]: La columna de Registro Patronal tiene "${rawRP}". Verifica que esté alineado a partir del nuevo campo 'Tipo de Ubicación'.`
                });
                continue;
            }

            if (!codigoPostal || !estado || !municipio || !colonia || !calle || !noExt) {
                errors.push({ row: rowNumber, error: `[Ubicación ${descripcion}]: Faltan campos obligatorios del domicilio.` });
                continue;
            }

            // Resolver FK de Tipo de Ubicación
            const idTipoUbicacion = tipoUbicacionMap.get(rawTipoUbicacion) || fallbackTipoId;

            // Resolver FK de Registro Patronal
            const idRegistroPatronal = rawRP ? rpMap.get(rawRP) || null : null;
            if (rawRP && !idRegistroPatronal) {
                errors.push({ row: rowNumber, error: `[Ubicación ${descripcion}]: El Registro Patronal "${rawRP}" no existe ni pudo ser creado.` });
                continue;
            }

            // Resolver FK de Unidad Operativa
            const idUnidadOperativa = rawUO ? uoMap.get(rawUO) || null : null;

            // Validar Tipo Asistencia
            if (!['IVR', 'BIOMETRICO', 'APP_MOVIL'].includes(tipoAsistencia)) {
                tipoAsistencia = null;
            }

            try {
                await this.prismaService.$transaction(async (tx: any) => {
                    const site = await tx.catSites.create({
                        data: {
                            idEmpresa: companyId,
                            idTenant,
                            idTipoUbicacion, // 👈 Asigna el tipo seleccionado dinámicamente
                            idUnidadOperativa,
                            Descripcion: descripcion,
                            EsPrincipal: esPrincipal,
                            CodigoPostal: codigoPostal,
                            Colonia: colonia,
                            MunicipioDelegacion: municipio,
                            Estado: estado,
                            Calle: calle,
                            NoExterior: noExt,
                            NoInterior: noInt,
                            Pais: pais,
                            Latitud: null,
                            Longitud: null,
                            idRegistroPatronal,
                            ZonaFronteriza: zonaFronteriza,
                            TipoAsistencia: tipoAsistencia,
                            Activo: true,
                            FechaRegistro: new Date(),
                        },
                    });

                    // Registro en histórico de movimientos
                    const historyModel = tx.historicoMovimientos || tx.HistoricoMovimientos;
                    if (historyModel) {
                        await historyModel.create({
                            data: {
                                idUsuario: activeUser.id,
                                idEmpresa: companyId,
                                accion: 'CREAR',
                                tablaOrigen: 'CatSites',
                                idRegistro: String(site.idSite),
                                descripcion: `Ubicación "${descripcion}" creada mediante carga masiva por ${userFullName}`,
                                fechaCreacion: new Date(),
                            },
                        });
                    }
                });

                createdSites++;
            } catch (err: any) {
                errors.push({
                    row: rowNumber,
                    error: `[Ubicación ${descripcion}]: ${err.message || 'Error al insertar la ubicación'}`,
                });
            }
        }

        return {
            success: true,
            message: `Carga completada: ${createdSites} ubicaciones, ${createdRP} registros patronales y ${createdUO} unidades operativas procesadas.`,
            successCount: createdSites,
            totalProcessed: createdSites + errors.length,
            details: { createdSites, createdRP, createdUO },
            errors,
        };
    }
}