import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreatePlantillaDto } from './dto/create-plantilla.dto';
import { UpdateCamposDto } from './dto/update-campos.dto';
import { GenerarDocumentoDto } from './dto/generar-documento.dto';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as mammoth from 'mammoth';
import PizZip = require('pizzip');

const execAsync = promisify(exec);

/**
 * Reemplaza texto original en el XML interno del DOCX con un placeholder {{identificador}}.
 * Maneja la fragmentación de texto en múltiples <w:r> runs dentro de un <w:p> párrafo.
 */
function replaceTextInDocxXml(xml: string, textoOriginal: string, placeholder: string): string {
    // Intentar reemplazo directo primero (texto en un solo <w:t>)
    if (xml.includes(textoOriginal)) {
        return xml.split(textoOriginal).join(placeholder);
    }

    // Manejar texto fragmentado entre múltiples runs dentro de un párrafo
    // Estrategia: en cada <w:p>, concatenar los <w:t> y si la concatenación contiene el texto,
    // colapsar esos runs en uno solo con el placeholder
    const paraRegex = /(<w:p[ >].*?<\/w:p>)/gs;
    return xml.replace(paraRegex, (para) => {
        // Extraer todos los textos de runs en orden
        const runTexts: { run: string; text: string }[] = [];
        const runRegex = /(<w:r[ >].*?<\/w:r>)/gs;
        let match: RegExpExecArray | null;
        while ((match = runRegex.exec(para)) !== null) {
            const run = match[1];
            const tMatch = run.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
            runTexts.push({ run, text: tMatch ? tMatch[1] : '' });
        }

        const fullText = runTexts.map(r => r.text).join('');
        if (!fullText.includes(textoOriginal)) return para;

        // Encontrar qué runs contienen el texto buscado
        let accumulated = '';
        let startIdx = -1;
        let endIdx = -1;
        for (let i = 0; i < runTexts.length; i++) {
            accumulated += runTexts[i].text;
            if (startIdx === -1 && accumulated.includes(textoOriginal.substring(0, 1))) {
                // Buscar desde qué run empieza
                let sub = '';
                for (let j = i; j < runTexts.length; j++) {
                    sub += runTexts[j].text;
                    if (sub.includes(textoOriginal)) {
                        startIdx = i;
                        endIdx = j;
                        break;
                    }
                }
                if (startIdx !== -1) break;
            }
        }

        if (startIdx === -1 || endIdx === -1) return para;

        // Extraer rPr (propiedades) del primer run para mantener el estilo
        const firstRun = runTexts[startIdx].run;
        const rPrMatch = firstRun.match(/<w:rPr[\s\S]*?<\/w:rPr>/);
        const rPr = rPrMatch ? rPrMatch[0] : '';

        // Construir nuevo run con el placeholder
        const newRun = `<w:r>${rPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r>`;

        // Reemplazar los runs afectados en el párrafo
        let result = para;
        const runsToReplace = runTexts.slice(startIdx, endIdx + 1).map(r => r.run);
        // Reemplazar el primer run con el nuevo, eliminar los demás
        result = result.replace(runsToReplace[0], newRun);
        for (let k = 1; k < runsToReplace.length; k++) {
            result = result.replace(runsToReplace[k], '');
        }
        return result;
    });
}

/**
 * Prepara un DOCX template reemplazando textoOriginal → {{identificador}} en el XML.
 * Guarda el resultado como archivoPrepared (al lado del original).
 */
function prepareDocxTemplate(
    originalPath: string,
    preparedPath: string,
    campos: { identificador: string; textoOriginal?: string | null }[],
): void {
    const buffer = fs.readFileSync(originalPath);
    const zip = new PizZip(buffer);

    const xmlFile = zip.file('word/document.xml');
    if (!xmlFile) throw new Error('No se encontró word/document.xml en el DOCX');

    let xml = xmlFile.asText();

    for (const campo of campos) {
        if (!campo.textoOriginal) continue;
        xml = replaceTextInDocxXml(xml, campo.textoOriginal, `{{${campo.identificador}}}`);
    }

    zip.file('word/document.xml', xml);
    const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(preparedPath, out);
}

/**
 * Genera un DOCX rellenando {{identificadores}} con valores.
 * Usa PizZip para leer/escribir el ZIP y string replace en el XML.
 * Funciona porque prepareDocxTemplate escribió los placeholders como nodos XML limpios.
 */
function generateDocxFromTemplate(
    templatePath: string,
    outputPath: string,
    valores: Record<string, string>,
): void {
    const buffer = fs.readFileSync(templatePath);
    const zip = new PizZip(buffer);

    const xmlFile = zip.file('word/document.xml');
    if (!xmlFile) throw new Error('No se encontró word/document.xml en el template DOCX');

    let xml = xmlFile.asText();

    for (const [key, value] of Object.entries(valores)) {
        // Escapar caracteres XML especiales en el valor
        const safeValue = value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        xml = xml.split(`{{${key}}}`).join(safeValue);
    }

    zip.file('word/document.xml', xml);
    const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(outputPath, out);
}

/**
 * Convierte un archivo DOCX a PDF usando mammoth (DOCX→HTML) + puppeteer (HTML→PDF).
 */
async function convertDocxToPdf(docxPath: string): Promise<Buffer> {
    const mammothResult = await mammoth.convertToHtml({ path: docxPath });
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 2cm; }
    body { font-family: Arial, sans-serif; line-height: 1.7; color: #1a1a1a; font-size: 12pt; }
    p { margin-bottom: 0.6em; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
    td, th { border: 1px solid #ccc; padding: 5px 8px; }
    h1, h2, h3 { margin-top: 1em; margin-bottom: 0.5em; }
    img { max-width: 100%; }
  </style>
</head>
<body>${mammothResult.value}</body>
</html>`;

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        return Buffer.from(pdfBuffer);
    } finally {
        await browser.close();
    }
}

@Injectable()
export class DocumentosTemplatesService {
    private readonly logger = new Logger(DocumentosTemplatesService.name);

    constructor(private readonly prisma: PrismaService) { }

    async create(
        companyId: number,
        createPlantillaDto: CreatePlantillaDto,
        file: Express.Multer.File,
        activeUser: ActiveUserDto,
    ) {
        if (!file) throw new BadRequestException('El archivo es requerido');

        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.docx') throw new BadRequestException('Solo se permiten archivos DOCX (.docx)');

        const plantillasDir = path.join(process.cwd(), 'media', 'plantillas');
        if (!fs.existsSync(plantillasDir)) {
            fs.mkdirSync(plantillasDir, { recursive: true });
        }

        const fileId = crypto.randomUUID();
        const filename = `${fileId}${ext}`;
        const filePath = path.join(plantillasDir, filename);

        fs.writeFileSync(filePath, file.buffer);

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
                archivoOriginal: `media/plantillas/${filename}`,
                archivoHtml: archivoHtml ?? undefined,
                idEmpresa: companyId,
                idModulo: createPlantillaDto.idModulo,
                idUsuarioCreador: activeUser.id,
            },
        });

        return plantilla;
    }

    async findAll(companyId: number, page: number, limit: number, search: string) {
        const skip = (page - 1) * limit;
        const where: any = {
            idEmpresa: companyId,
            activa: true,
        };

        if (search) {
            where.nombre = { contains: search };
        }

        const [data, total] = await Promise.all([
            this.prisma.plantillasDocumentos.findMany({
                where,
                skip,
                take: limit,
                orderBy: { fechaCreacion: 'desc' },
            }),
            this.prisma.plantillasDocumentos.count({ where }),
        ]);

        return {
            data,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
        };
    }

    async findOne(companyId: number, id: number) {
        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: { id, idEmpresa: companyId, activa: true },
            include: { campos: { orderBy: { orden: 'asc' } } },
        });

        if (!plantilla) throw new NotFoundException('Plantilla no encontrada');
        return plantilla;
    }

    async update(companyId: number, id: number, data: Partial<CreatePlantillaDto>) {
        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: { id, idEmpresa: companyId, activa: true },
        });

        if (!plantilla) throw new NotFoundException('Plantilla no encontrada');

        return this.prisma.plantillasDocumentos.update({
            where: { id },
            data: {
                ...data,
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

        // Preparar DOCX template: reemplazar textoOriginal → {{identificador}} en el XML
        const ext = path.extname(plantilla.archivoOriginal).toLowerCase();
        if (ext === '.docx') {
            try {
                const originalPath = path.join(process.cwd(), plantilla.archivoOriginal);
                const preparedPath = originalPath.replace(/\.docx$/i, '_template.docx');
                prepareDocxTemplate(originalPath, preparedPath, updateCamposDto.campos);
                this.logger.log(`Template DOCX preparado en: ${preparedPath}`);
            } catch (err) {
                this.logger.warn(`No se pudo preparar el template DOCX: ${err.message}`);
            }
        }

        return result;
    }

    async generate(companyId: number, id: number, generateDto: GenerarDocumentoDto, activeUser: ActiveUserDto) {
        const plantilla = await this.prisma.plantillasDocumentos.findFirst({
            where: { id, idEmpresa: companyId, activa: true },
            include: { campos: true },
        });

        if (!plantilla) throw new NotFoundException('Plantilla no encontrada');

        const originalPath = path.join(process.cwd(), plantilla.archivoOriginal);
        if (!fs.existsSync(originalPath)) {
            throw new BadRequestException('El archivo original de la plantilla no existe en el servidor');
        }

        const outputDir = path.join(process.cwd(), 'media', 'documentos-generados');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const docId = crypto.randomUUID();
        const ext = path.extname(plantilla.archivoOriginal).toLowerCase();
        let outputPath: string;
        let pdfFilename: string;
        let tempDocxPath: string | null = null;

        if (ext === '.pdf') {
            pdfFilename = `${docId}.pdf`;
            outputPath = path.join(outputDir, pdfFilename);
            await this.generatePdf(originalPath, plantilla.campos, generateDto.valores, outputPath);
        } else {
            pdfFilename = `${docId}.docx`;
            outputPath = path.join(outputDir, pdfFilename);

            // Usar el template preparado (con {{identificadores}}) si existe
            const preparedPath = originalPath.replace(/\.docx$/i, '_template.docx');
            const templatePath = fs.existsSync(preparedPath) ? preparedPath : originalPath;

            try {
                generateDocxFromTemplate(templatePath, outputPath, generateDto.valores);
            } catch (err) {
                this.logger.error(`Error generando DOCX: ${err.message}`);
                throw new InternalServerErrorException('Error al generar el documento DOCX');
            }
        }

        if (!fs.existsSync(outputPath)) {
            throw new InternalServerErrorException('Error al generar el documento: el archivo de salida no se creó');
        }

        const documento = await this.prisma.documentosGenerados.create({
            data: {
                idPlantilla: id,
                idVacante: generateDto.idVacante,
                idCandidato: generateDto.idCandidato,
                datosJson: generateDto.valores,
                archivoGenerado: `media/documentos-generados/${pdfFilename}`,
                estatus: 'generado',
                idUsuarioGenero: activeUser.id,
            },
        });

        return documento;
    }

    async findGenerated(companyId: number, page: number, limit: number) {
        const skip = (page - 1) * limit;
        const where = {
            plantilla: { idEmpresa: companyId },
        };

        const [data, total] = await Promise.all([
            this.prisma.documentosGenerados.findMany({
                where,
                skip,
                take: limit,
                orderBy: { fechaGeneracion: 'desc' },
                include: {
                    plantilla: { select: { id: true, nombre: true } },
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

    async servePdf(companyId: number, id: number): Promise<
        { type: 'pdf'; path: string } | { type: 'html'; content: string }
    > {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { id },
            include: { plantilla: { select: { idEmpresa: true } } },
        });

        if (!documento || documento.plantilla.idEmpresa !== companyId) {
            throw new NotFoundException('Documento no encontrado');
        }

        if (!documento.archivoGenerado) {
            throw new BadRequestException('El documento no tiene un archivo generado');
        }

        const originalPath = path.join(process.cwd(), documento.archivoGenerado);
        if (!fs.existsSync(originalPath)) {
            throw new NotFoundException('El archivo generado no existe en el servidor');
        }

        const ext = path.extname(originalPath).toLowerCase();
        if (ext === '.pdf') {
            return { type: 'pdf', path: originalPath };
        }

        // DOCX: convertir con mammoth en tiempo real (no cacheamos porque cambia con los datos)
        try {
            const result = await mammoth.convertToHtml({ path: originalPath });
            return { type: 'html', content: result.value };
        } catch (err) {
            this.logger.error(`Error convirtiendo DOCX generado a HTML con mammoth: ${err.message}`);
            throw new Error('No se pudo generar vista previa del archivo DOCX generado.');
        }
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

    async downloadGenerated(companyId: number, id: number): Promise<{ buffer?: Buffer; path?: string; contentType: string; filename: string }> {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { id },
            include: { plantilla: { select: { idEmpresa: true, nombre: true } } },
        });

        if (!documento || documento.plantilla.idEmpresa !== companyId) {
            throw new NotFoundException('Documento no encontrado');
        }

        if (!documento.archivoGenerado) {
            throw new BadRequestException('El documento no tiene un archivo generado');
        }

        const filePath = path.join(process.cwd(), documento.archivoGenerado);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('El archivo generado no existe en el servidor');
        }

        const ext = path.extname(filePath).toLowerCase();
        const baseName = documento.plantilla.nombre || 'documento';
        const safeBase = baseName.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F ]/g, '_');

        if (ext === '.pdf') {
            return { path: filePath, contentType: 'application/pdf', filename: `${safeBase}.pdf` };
        }

        // DOCX → convertir a PDF con puppeteer
        this.logger.log(`Convirtiendo DOCX a PDF para descarga: ${filePath}`);
        const pdfBuffer = await convertDocxToPdf(filePath);
        return {
            buffer: pdfBuffer,
            contentType: 'application/pdf',
            filename: `${safeBase}.pdf`,
        };
    }

    async updateGenerated(companyId: number, id: number, generateDto: GenerarDocumentoDto, activeUser: ActiveUserDto) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { id, plantilla: { idEmpresa: companyId } },
            include: { plantilla: { include: { campos: true } } }
        });

        if (!documento) throw new NotFoundException('Documento generado no encontrado');

        const originalPath = path.join(process.cwd(), documento.plantilla.archivoOriginal);
        if (!fs.existsSync(originalPath)) {
            throw new BadRequestException('El archivo original de la plantilla no existe en el servidor');
        }

        const ext = path.extname(documento.plantilla.archivoOriginal).toLowerCase();
        
        if (!documento.archivoGenerado) {
            throw new BadRequestException('El documento no tiene un archivo generado');
        }
        
        let outputPath = path.join(process.cwd(), documento.archivoGenerado);
        
        if (ext === '.pdf') {
            await this.generatePdf(originalPath, documento.plantilla.campos, generateDto.valores, outputPath);
        } else {
            const preparedPath = originalPath.replace(/\.docx$/i, '_template.docx');
            const templatePath = fs.existsSync(preparedPath) ? preparedPath : originalPath;
            try {
                generateDocxFromTemplate(templatePath, outputPath, generateDto.valores);
            } catch (err) {
                this.logger.error(`Error con docxtemplater (update): ${err.message}. Usando fallback.`);
                let content = fs.readFileSync(originalPath, 'latin1');
                for (const campo of documento.plantilla.campos) {
                    const value = generateDto.valores[campo.identificador] ?? campo.valorDefault ?? '';
                    if (campo.textoOriginal) {
                        content = content.split(campo.textoOriginal).join(value);
                    }
                }
                fs.writeFileSync(outputPath, content, 'latin1');
            }
        }

        return this.prisma.documentosGenerados.update({
            where: { id },
            data: {
                datosJson: generateDto.valores,
                fechaGeneracion: new Date(),
                idUsuarioGenero: activeUser.id,
            }
        });
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
                const pdfPath = path.join(process.cwd(), documento.archivoGenerado);
                if (fs.existsSync(pdfPath)) {
                    previewUrl = `/api/v2/documentos/public/firmar/${token}/pdf`;
                }
            }
        }

        return {
            id: documento.id,
            plantillaNombre: documento.plantilla.nombre,
            firmado: documento.firmado,
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
        };
    }

    async serveSignaturePdf(token: string, res: any) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { tokenFirma: token },
        });

        if (!documento || !documento.archivoGenerado) {
            throw new NotFoundException('Documento no encontrado');
        }

        const filePath = path.join(process.cwd(), documento.archivoGenerado);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('Archivo no encontrado');
        }

        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(filePath);
        } else {
            // DOCX → convertir a PDF con mammoth + puppeteer
            const pdfBuffer = await convertDocxToPdf(filePath);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.end(pdfBuffer);
        }
    }

    async savePublicSignature(token: string, signatureData: { imagen: string; camposFirmados?: Record<string, string> }) {
        const documento = await this.prisma.documentosGenerados.findFirst({
            where: { tokenFirma: token },
            include: {
                plantilla: {
                    include: { campos: true }
                }
            }
        });

        if (!documento) throw new NotFoundException('Documento de firma no encontrado');
        if (documento.firmado) throw new BadRequestException('El documento ya fue firmado');

        if (!documento.archivoGenerado) {
            throw new BadRequestException('El documento no tiene un archivo generado');
        }

        const firmaCampos = documento.plantilla.campos.filter(c => c.tipoDato === 'firma');
        if (firmaCampos.length === 0) {
            throw new BadRequestException('El documento no tiene campos de firma');
        }

        const outputPath = path.join(process.cwd(), documento.archivoGenerado);
        const ext = path.extname(outputPath).toLowerCase();

        const firmaMeta = {
            fechaFirma: new Date().toISOString(),
            camposFirmados: signatureData.camposFirmados || {},
        };

        if (ext === '.pdf') {
            await this.embedSignatureInPdf(outputPath, firmaCampos, signatureData.imagen);

            return this.prisma.documentosGenerados.update({
                where: { id: documento.id },
                data: { firmado: true, datosFirma: firmaMeta },
            });
        } else {
            // DOCX: convertir a PDF, incrustar firma, guardar PDF firmado
            const pdfBuffer = await convertDocxToPdf(outputPath);

            const outputDir = path.join(process.cwd(), 'media', 'documentos-generados');
            const pdfFilename = `${crypto.randomUUID()}_firmado.pdf`;
            const pdfPath = path.join(outputDir, pdfFilename);

            fs.writeFileSync(pdfPath, pdfBuffer);

            // Incrustar firma en el PDF recién generado
            if (firmaCampos.some(c => c.posicionX != null && c.posicionY != null && c.pagina != null)) {
                await this.embedSignatureInPdf(pdfPath, firmaCampos, signatureData.imagen);
            }

            return this.prisma.documentosGenerados.update({
                where: { id: documento.id },
                data: {
                    firmado: true,
                    datosFirma: firmaMeta,
                    archivoGenerado: `media/documentos-generados/${pdfFilename}`,
                },
            });
        }
    }

    private async embedSignatureInPdf(
        pdfPath: string,
        firmaCampos: any[],
        signatureBase64: string,
    ) {
        const pdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);

        const base64Data = signatureBase64.replace(/^data:image\/png;base64,/, '');
        const imageBytes = Buffer.from(base64Data, 'base64');
        const signatureImage = await pdfDoc.embedPng(imageBytes);

        for (const campo of firmaCampos) {
            if (campo.pagina == null || campo.posicionX == null || campo.posicionY == null) continue;

            const pages = pdfDoc.getPages();
            const page = pages[campo.pagina - 1];
            if (!page) continue;

            const { height } = page.getSize();
            const x = campo.posicionX;
            const y = height - campo.posicionY;

            const ancho = campo.ancho || 150;
            const alto = campo.alto || 60;

            page.drawImage(signatureImage, {
                x,
                y: y - alto,
                width: ancho,
                height: alto,
            });
        }

        const modifiedPdfBytes = await pdfDoc.save();
        fs.writeFileSync(pdfPath, modifiedPdfBytes);
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
