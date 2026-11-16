import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';
import { NubariumService } from '../digital-files/services/nubarium.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreatePlantillaDto } from './dto/create-plantilla.dto';
import { UpdateCamposDto } from './dto/update-campos.dto';
import { GenerarDocumentoDto } from './dto/generar-documento.dto';
import * as path from 'path';
import * as fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as mammoth from 'mammoth';
import PizZip = require('pizzip');
import { MediaPathService } from 'src/common/services/media-path.service';
import { Response } from 'express';
import { tmpdir } from 'os';
import { convertDocxToPdf } from 'src/common/utils/libreoffice.util';
import { Prisma } from 'generated/prisma/client';

function decodeXmlText(value: string): string {
    return value.replace(
        /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
        (_match, entity: string) => {
            const normalized = entity.toLowerCase();

            if (normalized === 'amp') return '&';
            if (normalized === 'lt') return '<';
            if (normalized === 'gt') return '>';
            if (normalized === 'quot') return '"';
            if (normalized === 'apos') return "'";

            if (normalized.startsWith('#x')) {
                return String.fromCodePoint(
                    parseInt(normalized.substring(2), 16),
                );
            }

            if (normalized.startsWith('#')) {
                return String.fromCodePoint(
                    parseInt(normalized.substring(1), 10),
                );
            }

            return _match;
        },
    );
}

/**
 * Reemplaza texto original en el XML interno del DOCX con un placeholder {{identificador}}.
 * Maneja la fragmentación de texto en múltiples <w:r> runs dentro de un <w:p> párrafo.
 */
function replaceTextInDocxXml(
    xml: string,
    textoOriginal: string,
    replacement: string,
): string {
    if (!textoOriginal) return xml;

    return xml.replace(
        /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,
        paragraph => {
            const textNodeRegex =
                /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;

            const nodes: {
                content: string;
                start: number;
                end: number;
            }[] = [];

            let fullText = '';
            let nodeMatch: RegExpExecArray | null;

            while ((nodeMatch = textNodeRegex.exec(paragraph)) !== null) {
                const content = decodeXmlText(nodeMatch[2]);
                const start = fullText.length;

                fullText += content;

                nodes.push({
                    content,
                    start,
                    end: fullText.length,
                });
            }

            if (!nodes.length) return paragraph;

            const matches: { start: number; end: number }[] = [];
            let position = 0;

            while (true) {
                const index = fullText.indexOf(textoOriginal, position);

                if (index === -1) break;

                matches.push({
                    start: index,
                    end: index + textoOriginal.length,
                });

                position = index + textoOriginal.length;
            }

            if (!matches.length) return paragraph;

            for (const current of matches.reverse()) {
                const startIndex = nodes.findIndex(
                    node =>
                        current.start >= node.start &&
                        current.start < node.end,
                );

                const endIndex = nodes.findIndex(
                    node =>
                        current.end > node.start &&
                        current.end <= node.end,
                );

                if (startIndex === -1 || endIndex === -1) continue;

                const firstNode = nodes[startIndex];
                const lastNode = nodes[endIndex];

                const localStart = current.start - firstNode.start;
                const localEnd = current.end - lastNode.start;

                if (startIndex === endIndex) {
                    firstNode.content =
                        firstNode.content.slice(0, localStart) +
                        replacement +
                        firstNode.content.slice(localEnd);
                } else {
                    firstNode.content =
                        firstNode.content.slice(0, localStart) +
                        replacement;

                    for (let i = startIndex + 1; i < endIndex; i++) {
                        nodes[i].content = '';
                    }

                    lastNode.content =
                        lastNode.content.slice(localEnd);
                }
            }

            let nodeIndex = 0;

            return paragraph.replace(
                textNodeRegex,
                (_full, openingTag, _content, closingTag) => {
                    const content = escapeXmlText(
                        nodes[nodeIndex++]?.content ?? '',
                    );

                    return `${openingTag}${content}${closingTag}`;
                },
            );
        },
    );
}

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function generateDocxFromTemplate2(
    templatePath: string,
    campos: {
        identificador: string;
        textoOriginal?: string | null;
        valorDefault?: string | null;
    }[],
    valores: Record<string, string>,
): Buffer {
    const buffer = fs.readFileSync(templatePath);
    const zip = new PizZip(buffer);

    const xmlFiles = Object.keys(zip.files).filter(file =>
        /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(file),
    );

    if (!xmlFiles.includes('word/document.xml')) {
        throw new Error('No se encontró word/document.xml en el DOCX');
    }

    for (const fileName of xmlFiles) {
        const xmlFile = zip.file(fileName);
        if (!xmlFile) continue;

        let xml = xmlFile.asText();

        xml = xml.replace(
            /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,
            paragraph => {
                let result = paragraph;

                for (const campo of campos) {
                    if (!campo.textoOriginal) continue;

                    const value =
                        valores[campo.identificador] ??
                        campo.valorDefault ??
                        '';

                    result = replaceTextInDocxXml(
                        result,
                        campo.textoOriginal,
                        String(value),
                    );
                }

                return result;
            },
        );

        zip.file(fileName, xml);
    }

    return zip.generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
    });
}


@Injectable()
export class DocumentosTemplatesService {
    private readonly logger = new Logger(DocumentosTemplatesService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationDispatcher,
        private readonly nubarium: NubariumService,
        private readonly mediaPathService: MediaPathService,
    ) { }

    async create(
        companyId: number,
        createPlantillaDto: CreatePlantillaDto,
        file: Express.Multer.File,
        activeUser: ActiveUserDto,
    ) {
        if (!file) throw new BadRequestException('El archivo es requerido');

        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.docx') throw new BadRequestException('Solo se permiten archivos DOCX (.docx)');

        // Guardar el archivo físico y sus metadatos.
        const rutasArchivosGuardados: string[] = [];

        try {
            if (file) {
                if (!file.buffer || file.buffer.length === 0) {
                    throw new BadRequestException('El archivo recibido no contiene datos.');
                }

                const archivoGuardado = await this.mediaPathService.saveFile(
                    file,
                    {
                        idTenant: activeUser.idTenant,
                        subfolder: `plantillas/${createPlantillaDto.idTipoDocumento}`,
                    },
                );

                rutasArchivosGuardados.push(archivoGuardado.rutaRelativa);
            }
        } catch (error) {
            // Si falla el guardado, intentamos eliminar los archivos físicos.
            await Promise.all(
                rutasArchivosGuardados.map(
                    async (ruta) => {
                        try {
                            await this.mediaPathService.deleteFile(ruta);
                        } catch {
                            // Conservamos el error original.
                        }
                    },
                ),
            );
        }

        // Convertir DOCX a HTML para vista previa
        let archivoHtml: string | null = null;
        try {
            const result = await mammoth.convertToHtml({ buffer: file.buffer });
            archivoHtml = result.value;
        } catch (err) {
            this.logger.warn(`No se pudo convertir DOCX a HTML: ${err.message}`);
        }

        const plantilla = await this.prisma.plantillasDocumentos.create({
            data: {
                nombre: createPlantillaDto.nombre,
                descripcion: createPlantillaDto.descripcion,
                archivoOriginal: rutasArchivosGuardados[0],
                archivoHtml: archivoHtml ?? undefined,
                idEmpresa: companyId,
                idModulo: createPlantillaDto.idModulo,
                idTipoDocumento: createPlantillaDto.idTipoDocumento ? Number(createPlantillaDto.idTipoDocumento) : undefined,
                idUsuarioCreador: activeUser.id,
            },
        });

        return plantilla;
    }

    async findTiposDocumento(companyId: number) {
        return this.prisma.tiposDocumento.findMany({
            where: { idEmpresa: companyId, activo: true },
            orderBy: { nombre: 'asc' },
        });
    }

    async createTipoDocumento(companyId: number, nombre: string) {
        const existente = await this.prisma.tiposDocumento.findFirst({
            where: { idEmpresa: companyId, nombre },
        });

        if (existente) {
            if (!existente.activo) {
                return this.prisma.tiposDocumento.update({
                    where: { id: existente.id },
                    data: { activo: true },
                });
            }
            throw new BadRequestException('Ya existe un tipo de documento con ese nombre');
        }

        return this.prisma.tiposDocumento.create({
            data: { nombre, idEmpresa: companyId },
        });
    }

    async findAll(
        companyId: number,
        page: number,
        status: string,
        limit: number,
        search: string,
        idTipoDocumento?: number,
    ) {
        const skip = (page - 1) * limit;

        const where: Prisma.PlantillasDocumentosWhereInput = {
            idEmpresa: companyId,
        };

        // Filtro por estatus
        if (status === 'ACTIVAS') {
            where.activa = true;
        } else if (status === 'DESACTIVADAS') {
            where.activa = false;
        }
        // TODAS: no se agrega ningún filtro de activa

        // Búsqueda por nombre
        if (search?.trim()) {
            where.nombre = {
                contains: search.trim(),
            };
        }

        // Filtro por tipo de documento
        if (idTipoDocumento) {
            where.idTipoDocumento = idTipoDocumento;
        }

        const [data, total] = await Promise.all([
            this.prisma.plantillasDocumentos.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    fechaCreacion: 'desc',
                },
                include: {
                    TiposDocumento: {
                        select: {
                            id: true,
                            nombre: true,
                        },
                    },
                    _count: {
                        select: {
                            campos: true,
                        },
                    },
                },
            }),

            this.prisma.plantillasDocumentos.count({
                where,
            }),
        ]);

        return {
            data: data.map((plantilla) => ({
                ...plantilla,
                totalCampos: plantilla._count.campos,
                _count: undefined,
            })),
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
        };
    }

    async findOne(companyId: number, id: number) {
        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: { id, idEmpresa: companyId, activa: true },
            include: {
                campos: { orderBy: { orden: 'asc' } },
                TiposDocumento: { select: { id: true, nombre: true } },
            },
        });

        if (!plantilla) throw new NotFoundException('Plantilla no encontrada');
        return plantilla;
    }

    async update(companyId: number, id: number, data: Partial<CreatePlantillaDto>) {
        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: { id, idEmpresa: companyId, activa: true },
        });

        if (!plantilla) throw new NotFoundException('Plantilla no encontrada');

        const { idTipoDocumento, ...rest } = data;

        return this.prisma.plantillasDocumentos.update({
            where: { id },
            data: {
                ...rest,
                idTipoDocumento: idTipoDocumento !== undefined ? Number(idTipoDocumento) : undefined,
                fechaActualiz: new Date(),
            },
        });
    }

    async remove(companyId: number, id: number) {
        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: { id, idEmpresa: companyId, activa: true },
        });

        if (!plantilla) throw new NotFoundException('Plantilla no encontrada');

        return this.prisma.plantillasDocumentos.update({
            where: { id },
            data: { activa: false, fechaActualiz: new Date() },
        });
    }

    async reactivate(companyId: number, id: number) {
        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: {
                id,
                idEmpresa: companyId,
                activa: false,
            },
        });

        if (!plantilla) {
            throw new NotFoundException('Plantilla no encontrada o ya está activa');
        }

        return this.prisma.plantillasDocumentos.update({
            where: { id },
            data: {
                activa: true,
                fechaActualiz: new Date(),
            },
        });
    }

    async findByType(companyId: number, idTipoDocumento: number) {
        const plantillas = await this.prisma.plantillasDocumentos.findMany({
            where: {
                idEmpresa: companyId,
                idTipoDocumento,
                activa: true,
            },
            orderBy: { fechaCreacion: 'desc' },
            include: {
                TiposDocumento: {
                    select: {
                        id: true,
                        nombre: true,
                    },
                },
                _count: {
                    select: {
                        campos: true,
                    },
                },
            },
        });

        return plantillas.map((plantilla) => ({
            ...plantilla,
            totalCampos: plantilla._count.campos,
            _count: undefined,
        }));
    }


    async getGenerationData(user: ActiveUserDto, companyId: number, id: number, employeeId: number) {
        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: {
                id,
                idEmpresa: companyId,
                activa: true,
            },
            include: {
                campos: {
                    orderBy: { orden: 'asc' },
                },
                TiposDocumento: {
                    select: { id: true, nombre: true },
                },
            },
        });

        if (!plantilla) {
            throw new NotFoundException('Plantilla no encontrada');
        }

        const empleado = await this.prisma.empleados.findFirst({
            where: {
                idEmpleado: employeeId,
                idEmpresa: companyId,
                idTenant: user.idTenant,
                activo: true,
            },
        });

        if (!empleado) {
            throw new NotFoundException('Empleado no encontrado');
        }

        const [puesto, estadoCivil, salario, datosBancarios, empresa] = await Promise.all([
            empleado.idPuesto
                ? this.prisma.catPuestos.findUnique({
                    where: { idPuesto: empleado.idPuesto },
                })
                : null,
            empleado.idEstadoCivil
                ? this.prisma.catEstadoCivil.findUnique({
                    where: { idEstadoCivil: empleado.idEstadoCivil },
                })
                : null,
            this.prisma.historialSalarios.findFirst({
                where: {
                    idEmpleado: employeeId,
                    actual: true,
                },
                orderBy: { fechaInicio: 'desc' },
            }),
            this.prisma.datosBancarios.findFirst({
                where: { idEmpleado: employeeId },
            }),
            this.prisma.catEmpresas.findFirst({
                where: { idEmpresa: companyId },
            }),
        ]);

        const [area, domicilioEmpresa, domicilioEmpleado] = await Promise.all([
            puesto?.idArea
                ? this.prisma.catAreas.findUnique({
                    where: { idArea: puesto.idArea },
                })
                : null,
            this.prisma.domicilioEmpresas.findFirst({
                where: { idEmpresa: companyId },
                orderBy: { idDomicilioEmpresa: 'desc' },
            }),
            this.prisma.domicilioEmpleado.findFirst({
                where: { idEmpleado: employeeId },
            }),
        ]);

        const nombreCompleto = [
            empleado.nombre,
            empleado.primerApellido,
            empleado.segundoApellido,
        ].filter(Boolean).join(' ');

        const direccionEmpleado = domicilioEmpleado
            ? [
                domicilioEmpleado.calle,
                domicilioEmpleado.numeroExterior,
                domicilioEmpleado.numeroInterior,
                domicilioEmpleado.colonia,
                domicilioEmpleado.municipio,
                domicilioEmpleado.estado,
                domicilioEmpleado.codigoPostal,
            ].filter(Boolean).join(', ')
            : '';

        const direccionFiscal = domicilioEmpresa
            ? [
                domicilioEmpresa.calle,
                domicilioEmpresa.numero_exterior,
                domicilioEmpresa.numero_interior,
                domicilioEmpresa.colonia,
                domicilioEmpresa.municipio,
                domicilioEmpresa.estado,
                domicilioEmpresa.codigo_postal,
            ].filter(Boolean).join(', ')
            : '';

        const valoresDisponibles: Record<string, string> = {
            'empleado.nombre': nombreCompleto,
            'empleado.nombres': empleado.nombre || '',
            'empleado.apellido_paterno': empleado.primerApellido || '',
            'empleado.apellido_materno': empleado.segundoApellido || '',
            'empleado.curp': empleado.curp || '',
            'empleado.rfc': empleado.rfc || '',
            'empleado.nss': empleado.numeroSeguroSocial || '',
            'empleado.fecha_nacimiento': empleado.fechaNacimiento
                ? new Date(empleado.fechaNacimiento).toISOString().slice(0, 10)
                : '',
            'empleado.telefono': empleado.telefonoMovil || empleado.telefonoLocal || '',
            'empleado.correo': empleado.correo || '',
            'empleado.direccion': direccionEmpleado,
            'empleado.estado_civil': estadoCivil?.Descripcion || '',
            'empleado.puesto': puesto?.NombrePuesto || '',
            'empleado.area': area?.Descripcion || '',
            'empleado.fecha_ingreso': empleado.fechaIngreso
                ? new Date(empleado.fechaIngreso).toISOString().slice(0, 10)
                : '',
            'empleado.salarioBruto': salario?.salarioBruto?.toString() || '',
            'empleado.salarioNeto': salario?.salarioNeto?.toString() || '',
            'empleado.cuenta_bancaria': datosBancarios?.cuentaBancaria || '',
            'empresa.nombre': empresa?.nombre_comercial || '',
            'empresa.razon_social': empresa?.razon_social || '',
            'empresa.rfc': empresa?.rfc || '',
            'empresa.direccion_fiscal': direccionFiscal,
            'empresa.codigo_postal': domicilioEmpresa?.codigo_postal || '',
            'empresa.telefono': empresa?.telefono || '',
            'empresa.correo': empresa?.correo || '',
        };

        const valoresIniciales: Record<string, string> = {};

        for (const campo of plantilla.campos) {
            const identificador = campo.identificador;
            valoresIniciales[identificador] = valoresDisponibles[identificador] || '';
        }

        return {
            plantilla,
            empleado: {
                ...empleado,
                nombreCompleto,
                nombrePuesto: puesto?.NombrePuesto || '',
                nombreArea: area?.Descripcion || '',
                salarioBruto: salario?.salarioBruto?.toString() || '',
                salarioNeto: salario?.salarioNeto?.toString() || '',
                nombreEmpresa: empresa?.nombre_comercial || '',
                direccion: direccionEmpleado,
            },
            valoresIniciales,
        };
    }

    private async generatePdf(
        originalPath: string,
        campos: any[],
        valores: Record<string, string>,
        outputPath: string,
    ) {
        const pdfBytes = fs.readFileSync(originalPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const campo of campos) {
            if (campo.pagina == null || campo.posicionX == null || campo.posicionY == null) continue;

            const value = valores[campo.identificador] ?? campo.valorDefault ?? '';
            const pages = pdfDoc.getPages();
            const page = pages[campo.pagina - 1];
            if (!page) continue;

            const { height } = page.getSize();
            const x = campo.posicionX;
            const y = height - campo.posicionY;

            const rectWidth = campo.ancho || 150;
            const rectHeight = campo.alto || 20;
            page.drawRectangle({
                x,
                y: y - rectHeight,
                width: rectWidth,
                height: rectHeight,
                color: rgb(1, 1, 1),
            });

            const fontSize = 11;
            page.drawText(value, {
                x,
                y: y - rectHeight + 4,
                size: fontSize,
                font: helvetica,
                color: rgb(0, 0, 0),
            });
        }

        const modifiedPdfBytes = await pdfDoc.save();
        fs.writeFileSync(outputPath, modifiedPdfBytes);
    }

    async saveCampos(companyId: number, id: number, updateCamposDto: UpdateCamposDto) {
        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: { id, idEmpresa: companyId, activa: true },
        });

        if (!plantilla) throw new NotFoundException('Plantilla no encontrada');

        const result = await this.prisma.$transaction(async (tx) => {
            await tx.camposPlantilla.deleteMany({ where: { idPlantilla: id } });

            if (updateCamposDto.campos.length > 0) {
                await tx.camposPlantilla.createMany({
                    data: updateCamposDto.campos.map((c, index) => ({
                        idPlantilla: id,
                        identificador: c.identificador,
                        nombreCampo: c.nombreCampo,
                        tipoDato: c.tipoDato || 'texto',
                        requerido: c.requerido ?? true,
                        orden: c.orden ?? index,
                        valorDefault: c.valorDefault,
                        textoOriginal: c.textoOriginal,
                        pagina: c.pagina,
                        posicionX: c.posicionX,
                        posicionY: c.posicionY,
                        ancho: c.ancho,
                        alto: c.alto,
                    })),
                });
            }

            return tx.camposPlantilla.findMany({
                where: { idPlantilla: id },
                orderBy: { orden: 'asc' },
            });
        });

        return result;
    }

    async generate(
        companyId: number,
        id: number,
        employeeId: number,
        generateDto: GenerarDocumentoDto,
        activeUser: ActiveUserDto,
    ) {
        if (!activeUser.idTenant) {
            throw new BadRequestException('El usuario no tiene un tenant asignado.');
        }

        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: {
                id,
                idEmpresa: companyId,
                activa: true,
            },
            include: {
                campos: true,
            },
        });

        if (!plantilla) {
            throw new NotFoundException('Plantilla no encontrada');
        }

        const originalPath = await this.mediaPathService.fileExists(
            plantilla.archivoOriginal,
            'El archivo original de la plantilla no existe en el servidor.',
        );

        const docId = crypto.randomUUID();
        const ext = path.extname(originalPath).toLowerCase();

        if (ext !== '.docx' && ext !== '.pdf') {
            throw new BadRequestException('El formato de la plantilla no es compatible.');
        }

        const filename = `${docId}.pdf`;
        const mimeType = 'application/pdf';

        let buffer: Buffer;

        if (ext === '.pdf') {
            const tempDir = await this.mediaPathService.getTenantPath(
                this.mediaPathService.getMediaRootPath(),
                activeUser.idTenant,
                'documentos-generados-temp',
            );

            const tempPath = path.join(tempDir, filename);

            try {
                await this.generatePdf(
                    originalPath,
                    plantilla.campos,
                    generateDto.valores,
                    tempPath,
                );

                if (!await fs.pathExists(tempPath)) {
                    throw new Error('No se generó el archivo PDF.');
                }

                buffer = await fs.readFile(tempPath);
            } catch (err) {
                this.logger.error(`Error generando PDF: ${err.message}`);
                throw new InternalServerErrorException('Error al generar el documento PDF.');
            } finally {
                await fs.remove(tempPath);
            }
        } else {

            const tempDir = await fs.mkdtemp(
                path.join(tmpdir(), 'talentcore-document-'),
            );

            const tempDocxPath = path.join(tempDir, `${docId}.docx`);

            try {
                const docxBuffer = generateDocxFromTemplate2(
                    originalPath,
                    plantilla.campos,
                    generateDto.valores,
                );

                await fs.writeFile(tempDocxPath, docxBuffer);

                buffer = await convertDocxToPdf(tempDocxPath);

                if (!buffer || buffer.length === 0) {
                    throw new Error('La conversión no generó un PDF válido.');
                }
            } catch (err) {
                this.logger.error(`Error generando o convirtiendo DOCX a PDF: ${err.message}`);
                throw new InternalServerErrorException('Error al generar el documento PDF a partir de la plantilla Word.');
            } finally {
                await fs.remove(tempDir);
            }
        }

        // Determinar si el documento pertenece a un empleado o candidato
        const idEmpleado = employeeId && employeeId !== 0 ? employeeId : null;

        // Definir la carpeta de almacenamiento
        const subfolder = idEmpleado
            ? `plantillas/documentos-generados/empleados/${idEmpleado}`
            : `plantillas/documentos-generados/candidatos/${generateDto.idCandidato}`;

        const archivo = await this.mediaPathService.saveGeneratedFile(
            buffer,
            {
                idTenant: activeUser.idTenant,
                subfolder: subfolder,
                fileName: filename,
                mimeType,
            },
        );

        try {
            const documento = await this.prisma.documentosGenerados.create({
                data: {
                    idPlantilla: id,
                    idEmpleado: idEmpleado,
                    idVacante: generateDto.idVacante,
                    idCandidato: generateDto.idCandidato,
                    datosJson: generateDto.valores,
                    archivoGenerado: archivo.rutaRelativa,
                    estatus: 'generado',
                    idUsuarioGenero: activeUser.id,
                },
            });

            return documento;
        } catch (err) {
            console.log(err)
            try {
                await this.mediaPathService.deleteFile(archivo.rutaRelativa);
            } catch (deleteError) {
                this.logger.error(
                    `No se pudo eliminar el archivo generado: ${deleteError.message}`,
                );
            }

            throw err;
        }
    }

    async findCatalogsFiels(companyId: number) {
        return this.prisma.catCamposPlantilla.findMany({
            where: { activo: true },
            orderBy: [
                { grupo: "asc" },
                { orden: "asc" },
            ],
        })
    }

    async findGenerated(
        companyId: number,
        page: number,
        limit: number,
        search?: string,
    ) {
        const skip = (page - 1) * limit;
        const term = search?.trim();

        const where: Prisma.DocumentosGeneradosWhereInput = {
            plantilla: {
                idEmpresa: companyId,
            },
            ...(term && {
                OR: [
                    {
                        plantilla: {
                            nombre: {
                                contains: term,
                            },
                        },
                    },
                    {
                        plantilla: {
                            TiposDocumento: {
                                nombre: {
                                    contains: term,
                                },
                            },
                        },
                    },
                    {
                        Empleados: {
                            nombre: {
                                contains: term,
                            },
                        },
                    },
                    {
                        Empleados: {
                            primerApellido: {
                                contains: term,
                            },
                        },
                    },
                    {
                        Empleados: {
                            segundoApellido: {
                                contains: term,
                            },
                        },
                    },
                ],
            }),
        };

        const [data, total] = await Promise.all([
            this.prisma.documentosGenerados.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    fechaGeneracion: 'desc',
                },
                include: {
                    plantilla: {
                        select: {
                            id: true,
                            nombre: true,
                            TiposDocumento: {
                                select: {
                                    id: true,
                                    nombre: true,
                                },
                            },
                        },
                    },
                    Empleados: {
                        select: {
                            idEmpleado: true,
                            nombre: true,
                            primerApellido: true,
                            segundoApellido: true,
                        },
                    },
                },
            }),
            this.prisma.documentosGenerados.count({ where }),
        ]);

        return {
            data,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
        };
    }


    async servePdf(
        companyId: number,
        id: number,
        res: Response,
    ): Promise<void> {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { id },
            include: {
                plantilla: {
                    select: {
                        idEmpresa: true,
                    },
                },
            },
        });

        if (!documento || documento.plantilla.idEmpresa !== companyId) {
            throw new NotFoundException('Documento no encontrado');
        }

        if (!documento.archivoGenerado) {
            throw new BadRequestException('El documento no tiene un archivo generado.');
        }

        // Resolver y validar la ruta mediante MediaPathService.
        let originalPath: string;
        console.log(documento.archivoGenerado,)

        try {
            originalPath = await this.mediaPathService.fileExists(
                documento.archivoGenerado,
                'El archivo generado no existe en el servidor.',
            );
        } catch {
            throw new NotFoundException('El archivo generado no existe en el servidor.');
        }

        const ext = path.extname(originalPath).toLowerCase();
        const filename = path.basename(originalPath);

        // Evitar caché de documentos generados.
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Si ya es PDF, devolver directamente el archivo.
        if (ext === '.pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `inline; filename="${filename}"`,
            );

            await new Promise<void>((resolve, reject) => {
                res.sendFile(originalPath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            return;
        }

        // DOCX → PDF.
        if (ext === '.docx') {
            try {
                const pdfBuffer = await convertDocxToPdf(originalPath);

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader(
                    'Content-Disposition',
                    'inline; filename="documento.pdf"',
                );

                res.send(pdfBuffer);
                return;

            } catch (err) {
                this.logger.error(
                    `Error convirtiendo DOCX generado a PDF: ${err.message}`,
                );

                // Fallback: mostrar HTML si falla la conversión a PDF.
                try {
                    const result = await mammoth.convertToHtml({
                        path: originalPath,
                    });

                    const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 2rem;
            line-height: 1.7;
            color: #1a1a1a;
            font-size: 14px;
        }
        p { margin-bottom: 0.8rem; }
        table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 1rem;
        }
        td, th {
            border: 1px solid #ccc;
            padding: 6px 10px;
        }
        img { max-width: 100%; }
    </style>
</head>
<body>${result.value}</body>
</html>`;

                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.send(fullHtml);
                    return;

                } catch (mammothErr) {
                    this.logger.error(`Error convirtiendo DOCX a HTML: ${mammothErr.message}`);
                    throw new InternalServerErrorException('No se pudo generar la vista previa del documento.');
                }
            }
        }

        throw new BadRequestException('El formato del documento no es compatible.');
    }


    async findOneGenerated(companyId: number, id: number) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { id, plantilla: { idEmpresa: companyId } },
            include: {
                plantilla: {
                    include: { campos: { orderBy: { orden: 'asc' } } }
                }
            }
        });
        if (!documento) throw new NotFoundException('Documento generado no encontrado');
        return documento;
    }


    async downloadGenerated(
        companyId: number,
        id: number,
    ): Promise<{
        buffer?: Buffer;
        path?: string;
        contentType: string;
        filename: string;
    }> {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { id },
            include: {
                plantilla: {
                    select: {
                        idEmpresa: true,
                        nombre: true,
                    },
                },
            },
        });

        if (!documento || documento.plantilla.idEmpresa !== companyId) {
            throw new NotFoundException('Documento no encontrado');
        }

        if (!documento.archivoGenerado) {
            throw new BadRequestException(
                'El documento no tiene un archivo generado',
            );
        }

        // Resolver y validar la ruta mediante MediaPathService.
        const filePath = await this.mediaPathService.fileExists(
            documento.archivoGenerado,
            'El archivo generado no existe en el servidor.',
        );

        const ext = path.extname(filePath).toLowerCase();

        const baseName = documento.plantilla.nombre || 'documento';

        const safeBase = baseName.replace(
            /[^a-zA-Z0-9_\-\u00C0-\u024F ]/g,
            '_',
        );

        // Si ya es PDF, devolver directamente su ruta.
        if (ext === '.pdf') {
            return {
                path: filePath,
                contentType: 'application/pdf',
                filename: `${safeBase}.pdf`,
            };
        }

        // Si es DOCX, convertirlo a PDF antes de descargarlo.
        if (ext === '.docx') {
            this.logger.log(
                `Convirtiendo DOCX a PDF para descarga: ${documento.archivoGenerado}`,
            );

            const pdfBuffer = await convertDocxToPdf(filePath);

            if (!pdfBuffer || pdfBuffer.length === 0) {
                throw new BadRequestException(
                    'No se pudo convertir el documento a PDF',
                );
            }

            return {
                buffer: pdfBuffer,
                contentType: 'application/pdf',
                filename: `${safeBase}.pdf`,
            };
        }

        throw new BadRequestException(
            'El formato del documento no es compatible con la descarga',
        );
    }


    async updateGenerated(
        companyId: number,
        id: number,
        generateDto: GenerarDocumentoDto,
        activeUser: ActiveUserDto,
    ) {
        if (!activeUser.idTenant) {
            throw new BadRequestException('El usuario no tiene un tenant asignado.');
        }

        const documento = await this.prisma.documentosGenerados.findFirst({
            where: {
                id,
                plantilla: { idEmpresa: companyId },
            },
            include: {
                plantilla: {
                    include: { campos: true },
                },
            },
        });

        if (!documento) {
            throw new NotFoundException('Documento generado no encontrado');
        }

        if (documento.firmado) {
            throw new BadRequestException('No se puede modificar un documento que ya fue firmado.');
        }

        const originalPath = await this.mediaPathService.fileExists(
            documento.plantilla.archivoOriginal,
            'El archivo original de la plantilla no existe en el servidor.',
        );

        const ext = path.extname(originalPath).toLowerCase();

        if (ext !== '.docx' && ext !== '.pdf') {
            throw new BadRequestException('El formato de la plantilla no es compatible.');
        }

        const tempDir = await fs.mkdtemp(
            path.join(tmpdir(), 'talentcore-document-update-'),
        );

        let buffer: Buffer;

        try {
            if (ext === '.pdf') {
                const tempPdfPath = path.join(tempDir, 'documento.pdf');

                await this.generatePdf(
                    originalPath,
                    documento.plantilla.campos,
                    generateDto.valores,
                    tempPdfPath,
                );

                buffer = await fs.readFile(tempPdfPath);
            } else {

                const docxBuffer = generateDocxFromTemplate2(
                    originalPath,
                    documento.plantilla.campos,
                    generateDto.valores,
                );

                const tempDocxPath = path.join(tempDir, 'documento.docx');

                await fs.writeFile(tempDocxPath, docxBuffer);

                buffer = await convertDocxToPdf(tempDocxPath);
            }

            if (!buffer || buffer.length === 0) {
                throw new Error('No se generó el PDF actualizado.');
            }
        } catch (err) {
            this.logger.error(`Error actualizando documento generado: ${err.message}`);

            throw new InternalServerErrorException(
                'No se pudo actualizar el documento PDF.',
            );
        } finally {
            await fs.remove(tempDir);
        }

        const archivoAnterior = documento.archivoGenerado;

        const archivoNuevo = await this.mediaPathService.saveGeneratedFile(
            buffer,
            {
                idTenant: activeUser.idTenant,
                subfolder: 'plantillas/documentos-generados',
                fileName: `${crypto.randomUUID()}.pdf`,
                mimeType: 'application/pdf',
            },
        );

        try {
            const actualizado = await this.prisma.documentosGenerados.update({
                where: { id },
                data: {
                    datosJson: generateDto.valores,
                    archivoGenerado: archivoNuevo.rutaRelativa,
                    fechaGeneracion: new Date(),
                    idUsuarioGenero: activeUser.id,
                    firmado: false,
                    estatus: 'generado',
                },
            });

            if (archivoAnterior && archivoAnterior !== archivoNuevo.rutaRelativa) {
                await this.mediaPathService.deleteFile(archivoAnterior);
            }

            return actualizado;
        } catch (err) {
            await this.mediaPathService.deleteFile(archivoNuevo.rutaRelativa);
            throw err;
        }
    }


    async shareForSignature(companyId: number, id: number) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { id, plantilla: { idEmpresa: companyId } },
        });

        if (!documento) throw new NotFoundException('Documento generado no encontrado');

        if (!documento.tokenFirma) {
            const token = crypto.randomUUID();
            await this.prisma.documentosGenerados.update({
                where: { id },
                data: { tokenFirma: token },
            });
            return { token, url: `/firmar/${token}` };
        }

        return { token: documento.tokenFirma, url: `/firmar/${documento.tokenFirma}` };
    }

    async requestSignatureOtp(token: string) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: {
                tokenFirma: token,
            },
            include: {
                contrato: {
                    include: {
                        Empleados: {
                            select: {
                                idEmpleado: true,
                                nombre: true,
                                primerApellido: true,
                                correo: true,
                                telefonoMovil: true,
                                idUsuario: true,
                            },
                        },
                    },
                },
            },
        });

        if (!documento) {
            throw new NotFoundException('Documento de firma no encontrado');
        }

        if (documento.firmado) {
            throw new BadRequestException('El documento ya fue firmado');
        }

        // Si existe contrato, conservamos el empleado asociado al contrato.
        // Si no existe, utilizamos el idEmpleado del documento generado.
        let empleado = documento.contrato?.Empleados ?? null;

        if (!empleado && documento.idEmpleado) {
            empleado = await this.prisma.empleados.findFirst({
                where: {
                    idEmpleado: documento.idEmpleado,
                    activo: true,
                },
                select: {
                    idEmpleado: true,
                    nombre: true,
                    primerApellido: true,
                    correo: true,
                    telefonoMovil: true,
                    idUsuario: true,
                },
            });
        }

        if (!empleado) {
            throw new BadRequestException(
                'No se encontró un empleado asociado al documento de firma',
            );
        }

        if (!empleado.telefonoMovil) {
            throw new BadRequestException(
                'El empleado no tiene un teléfono registrado',
            );
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const fechaToken = new Date();

        // El OTP siempre se guarda en DocumentosGenerados.
        await this.prisma.$transaction(async (tx) => {
            await tx.documentosGenerados.update({
                where: {
                    id: documento.id,
                },
                data: {
                    tokenValidacion: otp,
                    fechaToken,
                },
            });

            // Compatibilidad con el flujo anterior de contratos.
            if (documento.contrato) {
                await tx.contratos.update({
                    where: {
                        idContrato: documento.contrato.idContrato,
                    },
                    data: {
                        tokenValidacion: otp,
                        fechaToken,
                    },
                });
            }
        });

        const nombreCompleto = [
            empleado.nombre,
            empleado.primerApellido,
        ]
            .filter(Boolean)
            .join(' ');

        const userUuid =
            empleado.idUsuario || `empleado-${empleado.idEmpleado}`;

        await this.notifications.notify({
            userUuid,
            notificationTypeCode: 'CONTRACT_SIGN_TOKEN',
            to: empleado.correo || undefined,
            phone: empleado.telefonoMovil,
            subject: 'Código de Validación',
            context: { otp },
        });

        this.logger.log(
            documento.contrato
                ? `OTP de firma enviado a ${empleado.telefonoMovil} para contrato ${documento.contrato.idContrato}`
                : `OTP de firma enviado a ${empleado.telefonoMovil} para documento generado ${documento.id}`,
        );

        return {
            sent: true,
            phone: `***${empleado.telefonoMovil.slice(-4)}`,
        };
    }

    private async verifySignatureOtp(documentoId: number, otp: string) {
        const documento = await this.prisma.documentosGenerados.findUnique({
            where: { id: documentoId },
            select: {
                id: true,
                tokenValidacion: true,
                fechaToken: true,
            },
        });

        if (!documento) {
            throw new NotFoundException('Documento de firma no encontrado');
        }

        if (!documento.tokenValidacion || !documento.fechaToken) {
            throw new BadRequestException('No se ha solicitado un código de validación');
        }

        const elapsed = Date.now() - new Date(documento.fechaToken).getTime();

        if (elapsed > 10 * 60 * 1000) {
            throw new BadRequestException('El código ha expirado. Solicita uno nuevo.');
        }

        if (documento.tokenValidacion !== otp) {
            throw new BadRequestException('Código incorrecto');
        }

        return true;
    }

    async getForPublicSignature(token: string) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { tokenFirma: token },
            include: {
                plantilla: {
                    include: { campos: { orderBy: { orden: 'asc' } } }
                }
            }
        });

        if (!documento) throw new NotFoundException('Documento de firma no encontrado');

        const firmaCampos = documento.plantilla.campos.filter(c => c.tipoDato === 'firma');

        let previewUrl: string | null = null;
        if (documento.archivoGenerado) {
            const ext = path.extname(documento.archivoGenerado).toLowerCase();
            if (ext === '.pdf') {
                try {
                    await this.mediaPathService.fileExists(
                        documento.archivoGenerado,
                        'El archivo generado no existe en el servidor.',
                    );

                    previewUrl = `/api/v2/documents/public/sign/${token}/pdf`;
                } catch {
                    previewUrl = null;
                }
            }
        }

        return {
            id: documento.id,
            plantillaNombre: documento.plantilla.nombre,
            firmado: documento.firmado,
            sellado: documento.estatus === 'sellado',
            codigoValidacion: documento.codigoValidacionNOM151 || null,
            firmaCampos: firmaCampos.map(c => ({
                identificador: c.identificador,
                nombreCampo: c.nombreCampo,
                pagina: c.pagina,
                posicionX: c.posicionX,
                posicionY: c.posicionY,
                ancho: c.ancho || 150,
                alto: c.alto || 60,
            })),
            previewUrl,
            firmaConfigurada: documento.firmaConfigurada,
            firmaPagina: documento.firmaPagina,
            firmaX: documento.firmaX,
            firmaY: documento.firmaY,
            firmaAncho: documento.firmaAncho,
            firmaAlto: documento.firmaAlto
        };
    }

    async serveSignaturePdf(
        token: string,
        res: Response,
    ): Promise<void> {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { tokenFirma: token },
        });

        if (!documento || !documento.archivoGenerado) {
            throw new NotFoundException('Documento no encontrado');
        }

        let filePath: string;

        try {
            filePath = await this.mediaPathService.fileExists(
                documento.archivoGenerado,
                'El archivo generado no existe en el servidor.',
            );
        } catch {
            throw new NotFoundException('Archivo no encontrado');
        }

        const ext = path.extname(filePath).toLowerCase();
        const filename = path.basename(filePath);

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

        if (ext === '.pdf') {
            res.setHeader('Content-Type', 'application/pdf');

            await new Promise<void>((resolve, reject) => {
                res.sendFile(filePath, (error) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                });
            });

            return;
        }

        if (ext === '.docx') {
            let pdfBuffer: Buffer;

            try {
                pdfBuffer = await convertDocxToPdf(filePath);
            } catch (error) {
                this.logger.error(`Error convirtiendo DOCX para firma: ${error.message}`);
                throw new InternalServerErrorException('No se pudo generar la vista previa del documento.');
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="documento.pdf"');
            res.send(pdfBuffer);

            return;
        }

        throw new BadRequestException('El formato del documento no es compatible.');
    }


    async savePublicSignature(
        token: string,
        signatureData: {
            imagen: string;
            camposFirmados?: Record<string, string>;
            otp: string;
        },
    ) {
        if (!signatureData.otp) {
            throw new BadRequestException('El código de validación es requerido');
        }

        if (!signatureData.imagen) {
            throw new BadRequestException('La imagen de la firma es requerida');
        }

        const documento = await this.prisma.documentosGenerados.findFirst({
            where: {
                tokenFirma: token,
            },
            include: {
                contrato: true,
                plantilla: {
                    select: {
                        nombre: true,
                        idEmpresa: true,
                    },
                },
            },
        });

        if (!documento) {
            throw new NotFoundException('Documento de firma no encontrado');
        }

        if (documento.firmado) {
            throw new BadRequestException('El documento ya fue firmado');
        }

        if (!documento.archivoGenerado) {
            throw new BadRequestException('El documento no tiene un archivo generado',);
        }

        // Validar que exista una posición de firma configurada.
        if (!documento.firmaConfigurada) {
            throw new BadRequestException('El documento no tiene una posición de firma configurada');
        }

        if (
            documento.firmaPagina == null ||
            documento.firmaX == null ||
            documento.firmaY == null ||
            documento.firmaAncho == null ||
            documento.firmaAlto == null
        ) {
            throw new BadRequestException('La posición de firma del documento está incompleta');
        }

        const posicionFirma = {
            pagina: Number(documento.firmaPagina),
            x: Number(documento.firmaX),
            y: Number(documento.firmaY),
            ancho: Number(documento.firmaAncho),
            alto: Number(documento.firmaAlto),
        };

        if (
            !Number.isInteger(posicionFirma.pagina) ||
            posicionFirma.pagina < 1 ||
            posicionFirma.x < 0 ||
            posicionFirma.y < 0 ||
            posicionFirma.ancho <= 0 ||
            posicionFirma.alto <= 0 ||
            posicionFirma.x + posicionFirma.ancho > 100 ||
            posicionFirma.y + posicionFirma.alto > 100
        ) {
            throw new BadRequestException('La posición de firma guardada no es válida');
        }

        await this.verifySignatureOtp(documento.id, signatureData.otp);

        // Resolver el archivo original.
        const outputPath = await this.mediaPathService.fileExists(
            documento.archivoGenerado,
            'El archivo generado no existe en el servidor.',
        );

        const ext = path.extname(outputPath).toLowerCase();

        if (ext !== '.pdf' && ext !== '.docx') {
            throw new BadRequestException('El formato del documento no es compatible con la firma');
        }

        // Validar que la imagen sea PNG.
        const base64Data = signatureData.imagen.replace(
            /^data:image\/png;base64,/i,
            '',
        );

        const imageBytes = Buffer.from(base64Data, 'base64');

        if (
            imageBytes.length === 0 ||
            imageBytes.toString('hex', 0, 8) !== '89504e470d0a1a0a'
        ) {
            throw new BadRequestException(
                'La imagen de firma no es un PNG válido',
            );
        }

        const outputDir = path.dirname(outputPath);
        const signedFilename = `${crypto.randomUUID()}_firmado.pdf`;
        const signedPath = path.join(outputDir, signedFilename);

        const relativeDirectory = path.posix.dirname(
            documento.archivoGenerado.replace(/\\/g, '/'),
        );

        const signedRelativePath = path.posix.join(
            relativeDirectory,
            signedFilename,
        );

        let tempDir: string | null = null;

        try {
            let pdfInputPath = outputPath;

            // Si el documento original es DOCX, convertirlo antes de insertar la firma.
            if (ext === '.docx') {
                tempDir = await fs.mkdtemp(path.join(tmpdir(), 'talentcore-signature-'));

                pdfInputPath = path.join(tempDir, 'documento.pdf');

                const pdfBuffer = await convertDocxToPdf(outputPath);

                if (!pdfBuffer || pdfBuffer.length === 0) {
                    throw new Error('No se pudo convertir el documento a PDF');
                }

                await fs.writeFile(pdfInputPath, pdfBuffer);
            }

            // Insertar la firma usando las coordenadas porcentuales guardadas.
            await this.embedSignatureInPdf(
                pdfInputPath,
                signedPath,
                posicionFirma,
                signatureData.imagen,
            );

            const firmaMeta = {
                fechaFirma: new Date().toISOString(),
                camposFirmados: signatureData.camposFirmados || {},
                posicionFirma,
            };

            // Guardar documento firmado y consumir OTP.
            await this.prisma.$transaction(async (tx) => {
                await tx.documentosGenerados.update({
                    where: {
                        id: documento.id,
                    },
                    data: {
                        firmado: true,
                        estatus: 'firmado',
                        datosFirma: firmaMeta,
                        archivoGenerado: signedRelativePath,
                        tokenValidacion: null,
                        fechaToken: null,
                    },
                });

                // Si existe contrato, conservar la actualización anterior.
                if (documento.contrato) {
                    await tx.contratos.update({
                        where: {
                            idContrato: documento.contrato.idContrato,
                        },
                        data: {
                            tokenValidacion: null,
                            fechaToken: null,
                        },
                    });
                }
            });

            // Una vez confirmado el guardado, eliminar el archivo anterior.
            try {
                await this.mediaPathService.deleteFile(documento.archivoGenerado);
            } catch (error: any) {
                this.logger.warn(`No se pudo eliminar el PDF anterior del documento ${documento.id}: ${error.message}`);
            }
        } catch (error: any) {
            // Si algo falla, no dejamos archivos firmados huérfanos.
            try {
                if (await fs.pathExists(signedPath)) {
                    await fs.remove(signedPath);
                }
            } catch (cleanupError: any) {
                this.logger.error(`No se pudo limpiar el archivo temporal de firma: ${cleanupError.message}`);
            }

            throw error;
        } finally {
            if (tempDir) {
                await fs.remove(tempDir);
            }
        }

        // Sellado NOM-151 después de guardar la firma.
        const sellado = await this.sellarConNOM151(documento.id);

        const actualizado = await this.prisma.documentosGenerados.findUnique({
            where: { id: documento.id },
        });

        return {
            ...actualizado,
            sellado,
        };
    }


    /**
 * Sella el PDF firmado con constancia NOM-151 vía Nubarium.
 *
 * Éxito:
 * - estatus = 'sellado'
 * - Guarda los datos NOM-151.
 * - Guarda el certificado .cer.
 * - Guarda la representación visual PDF si Nubarium la devuelve.
 *
 * Fallo:
 * - El documento conserva su firma.
 * - Registra el error en datosFirma.selladoError.
 * - Devuelve false.
 */
    private async sellarConNOM151(documentoId: number): Promise<boolean> {
        let archivoCer: string | null = null;
        let archivoPdfConstancia: string | null = null;

        try {
            const documento = await this.prisma.documentosGenerados.findUnique({
                where: { id: documentoId },
                include: {
                    plantilla: {
                        select: {
                            idEmpresa: true,
                        },
                    },
                },
            });

            if (!documento?.archivoGenerado) {
                throw new Error('El documento no tiene archivo generado');
            }

            // Obtener el tenant de la empresa asociada a la plantilla.
            const empresa = await this.prisma.catEmpresas.findFirst({
                where: {
                    idEmpresa: documento.plantilla.idEmpresa,
                },
                select: {
                    idTenant: true,
                },
            });

            if (!empresa?.idTenant) {
                throw new Error('No se pudo identificar el tenant de la empresa del documento');
            }

            // Resolver el PDF firmado mediante MediaPathService.
            const pdfPath = await this.mediaPathService.fileExists(
                documento.archivoGenerado,
                'El archivo firmado no existe en el servidor.',
            );

            if (path.extname(pdfPath).toLowerCase() !== '.pdf') {
                throw new Error('El archivo firmado no es PDF');
            }

            const pdfBuffer = await fs.readFile(pdfPath);

            if (!pdfBuffer.length) {
                throw new Error('El archivo PDF firmado está vacío');
            }

            // Enviar el documento a Nubarium.
            const sello = await this.nubarium.sellarNOM151(pdfBuffer);

            if (!sello.nom151Base64) {
                throw new Error('Nubarium no devolvió el certificado NOM-151');
            }

            // Carpeta de certificados dentro de documentos-generados.
            const subfolder = 'plantillas/documentos-generados/certificados';

            const cerFilename = `${documento.uuid}.cer`;
            const pdfConstanciaFilename = `${documento.uuid}_constancia.pdf`;

            // Guardar certificado ASN.1 (.cer).
            const cerBuffer = Buffer.from(
                sello.nom151Base64.replace(
                    /^data:.*?;base64,/i,
                    '',
                ),
                'base64',
            );

            if (!cerBuffer.length) {
                throw new Error(
                    'El certificado NOM-151 recibido está vacío',
                );
            }

            const certificado = await this.mediaPathService.saveGeneratedFile(
                cerBuffer,
                {
                    idTenant: empresa.idTenant,
                    subfolder,
                    fileName: cerFilename,
                    mimeType: 'application/pkix-cert',
                },
            );

            archivoCer = certificado.rutaRelativa;

            // Guardar representación visual PDF si Nubarium la devuelve.
            if (sello.representacionVisualBase64) {
                const constanciaBuffer = Buffer.from(
                    sello.representacionVisualBase64.replace(
                        /^data:.*?;base64,/i,
                        '',
                    ),
                    'base64',
                );

                if (constanciaBuffer.length) {
                    const constancia =
                        await this.mediaPathService.saveGeneratedFile(
                            constanciaBuffer,
                            {
                                idTenant: empresa.idTenant,
                                subfolder,
                                fileName: pdfConstanciaFilename,
                                mimeType: 'application/pdf',
                            },
                        );

                    archivoPdfConstancia = constancia.rutaRelativa;
                }
            }

            // Guardar siempre la ruta del certificado .cer.
            await this.prisma.documentosGenerados.update({
                where: { id: documentoId },
                data: {
                    estatus: 'sellado',
                    codigoValidacionNOM151: sello.codigoValidacion,
                    hashNOM151: sello.hash,
                    archivoNom151: archivoCer,
                    fechaSellado: new Date(),
                },
            });

            this.logger.log(
                `Documento ${documentoId} sellado NOM-151: ${sello.codigoValidacion}`,
            );

            return true;
        } catch (error: any) {
            this.logger.error(`Fallo sellado NOM-151 documento ${documentoId}: ${error.message}`);
            // Limpiar archivos si el proceso no pudo completarse.
            for (const archivo of [archivoCer, archivoPdfConstancia]) {
                if (!archivo) continue;
                try {
                    await this.mediaPathService.deleteFile(archivo);
                } catch (cleanupError: any) {
                    this.logger.warn(`No se pudo eliminar archivo NOM-151 ${archivo}: ${cleanupError.message}`);
                }
            }

            // Registrar el error sin revertir la firma del documento.
            try {
                const documento = await this.prisma.documentosGenerados.findUnique({
                    where: { id: documentoId },
                });

                const datosFirma =
                    (documento?.datosFirma as Record<string, any>) || {};

                await this.prisma.documentosGenerados.update({
                    where: { id: documentoId },
                    data: {
                        datosFirma: {
                            ...datosFirma,
                            selladoError: error.message,
                        },
                    },
                });
            } catch (dbError: any) {
                this.logger.error(
                    `No se pudo guardar selladoError en documento ${documentoId}: ${dbError.message}`,
                );
            }

            return false;
        }
    }

    /**
     * Reintento manual de sellado NOM-151 (admin). Bloqueante, error visible.
     */
    async sellarManual(companyId: number, id: number) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { id, plantilla: { idEmpresa: companyId } },
        });

        if (!documento) throw new NotFoundException('Documento generado no encontrado');
        if (!documento.firmado) throw new BadRequestException('El documento aún no ha sido firmado');
        if (documento.estatus === 'sellado') throw new BadRequestException('El documento ya está sellado NOM-151');

        const sellado = await this.sellarConNOM151(documento.id);
        if (!sellado) {
            const fresco = await this.prisma.documentosGenerados.findUnique({ where: { id: documento.id } });
            const datosFirma = (fresco?.datosFirma as Record<string, any>) || {};
            throw new InternalServerErrorException(
                `No se pudo sellar el documento con NOM-151: ${datosFirma.selladoError || 'error desconocido'}`,
            );
        }

        return this.prisma.documentosGenerados.findUnique({ where: { id: documento.id } });
    }

    /**
 * Obtiene el archivo de constancia NOM-151 (.cer o representación visual PDF).
 */
    async getNom151File(
        companyId: number,
        id: number,
        tipo: 'cer' | 'pdf' = 'cer',
    ) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: {
                id,
                plantilla: {
                    idEmpresa: companyId,
                },
            },
        });

        if (!documento) {
            throw new NotFoundException(
                'Documento generado no encontrado',
            );
        }

        if (!documento.archivoNom151) {
            throw new BadRequestException(
                'El documento no tiene constancia NOM-151',
            );
        }

        const rutaGuardada = documento.archivoNom151;

        let rutaRelativa: string;

        // Compatibilidad con registros anteriores que guardaron el PDF
        // en archivoNom151 en lugar del certificado .cer.
        if (/_constancia\.pdf$/i.test(rutaGuardada)) {
            rutaRelativa =
                tipo === 'pdf'
                    ? rutaGuardada
                    : rutaGuardada.replace(
                        /_constancia\.pdf$/i,
                        '.cer',
                    );
        } else {
            rutaRelativa =
                tipo === 'pdf'
                    ? rutaGuardada.replace(
                        /\.cer$/i,
                        '_constancia.pdf',
                    )
                    : rutaGuardada;
        }

        // Resolver y validar el archivo mediante MediaPathService.
        let filePath: string;

        try {
            filePath = await this.mediaPathService.fileExists(
                rutaRelativa,
                'El archivo de constancia NOM-151 no existe en el servidor.',
            );
        } catch {
            throw new NotFoundException(
                tipo === 'pdf'
                    ? 'La representación visual de la constancia no existe en el servidor'
                    : 'El certificado NOM-151 no existe en el servidor',
            );
        }

        return {
            path: filePath,
            contentType:
                tipo === 'pdf'
                    ? 'application/pdf'
                    : 'application/pkix-cert',
            filename: path.basename(filePath),
        };
    }


    private async embedSignatureInPdf(
        pdfPath: string,
        outputPath: string,
        posicionFirma: {
            pagina: number;
            x: number;
            y: number;
            ancho: number;
            alto: number;
        },
        signatureBase64: string,
    ): Promise<void> {
        const pdfBytes = await fs.readFile(pdfPath);

        const pdfDoc = await PDFDocument.load(pdfBytes);

        const pages = pdfDoc.getPages();

        const pageIndex = posicionFirma.pagina - 1;
        const page = pages[pageIndex];

        if (!page) {
            throw new BadRequestException(
                `La página ${posicionFirma.pagina} no existe en el documento`,
            );
        }

        const base64Data = signatureBase64.replace(
            /^data:image\/png;base64,/i,
            '',
        );

        const imageBytes = Buffer.from(base64Data, 'base64');

        const signatureImage = await pdfDoc.embedPng(imageBytes);

        const { width: pageWidth, height: pageHeight } = page.getSize();

        // Convertir porcentajes del frontend a puntos PDF.
        const x = (posicionFirma.x / 100) * pageWidth;

        const width = (posicionFirma.ancho / 100) * pageWidth;
        const height = (posicionFirma.alto / 100) * pageHeight;

        // El frontend utiliza origen superior izquierdo.
        // PDF-lib utiliza origen inferior izquierdo.
        const top = (posicionFirma.y / 100) * pageHeight;
        const y = pageHeight - top - height;

        // Validar límites reales de la página.
        if (
            x < 0 ||
            y < 0 ||
            x + width > pageWidth + 0.01 ||
            y + height > pageHeight + 0.01
        ) {
            throw new BadRequestException(
                'La posición de la firma queda fuera de los límites de la página PDF',
            );
        }

        page.drawImage(signatureImage, {
            x,
            y,
            width,
            height,
        });

        const modifiedPdfBytes = await pdfDoc.save();

        await fs.writeFile(outputPath, modifiedPdfBytes);
    }


    async serveOriginalPdf(companyId: number, id: number): Promise<
        { type: 'pdf'; path: string } | { type: 'html'; content: string }
    > {
        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: { id, idEmpresa: companyId, activa: true },
        });
        if (!plantilla) throw new NotFoundException('Plantilla no encontrada');

        const originalPath = path.join(process.cwd(), plantilla.archivoOriginal);
        if (!fs.existsSync(originalPath)) {
            throw new NotFoundException('El archivo original no existe en el servidor');
        }

        const ext = path.extname(originalPath).toLowerCase();
        if (ext === '.pdf') {
            return { type: 'pdf', path: originalPath };
        }

        // DOCX: usar archivoHtml cacheado en DB, o convertir con mammoth en tiempo real
        if (plantilla.archivoHtml) {
            return { type: 'html', content: plantilla.archivoHtml };
        }

        try {
            const result = await mammoth.convertToHtml({ path: originalPath });
            // Cachear en DB para siguientes requests
            await this.prisma.plantillasDocumentos.update({
                where: { id },
                data: { archivoHtml: result.value, fechaActualiz: new Date() },
            });
            return { type: 'html', content: result.value };
        } catch (err) {
            this.logger.error(`Error convirtiendo DOCX a HTML con mammoth: ${err.message}`);
            throw new Error('No se pudo generar vista previa del archivo DOCX.');
        }
    }
}
