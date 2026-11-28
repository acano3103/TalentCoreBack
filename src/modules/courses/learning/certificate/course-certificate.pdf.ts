import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';

export interface CertificateData {
    empresa: string;
    empleado: string;
    curso: string;
    folio: string;
    fechaConclusion: string | null;
    fechaEmision: string;
    logo?: { bytes: Uint8Array; tipo: 'png' | 'jpg' } | null;
}

const NAVY = rgb(15 / 255, 42 / 255, 74 / 255);
const CIAN = rgb(34 / 255, 184 / 255, 207 / 255);
const CIAN_TXT = rgb(34 / 255, 162 / 255, 184 / 255);
const GRIS = rgb(71 / 255, 85 / 255, 105 / 255);
const GRIS_CLARO = rgb(148 / 255, 163 / 255, 184 / 255);
const TEXTO = rgb(15 / 255, 23 / 255, 42 / 255);
const BLANCO = rgb(1, 1, 1);

// Hoja carta horizontal (puntos)
const ANCHO = 792;
const ALTO = 612;

function centrado(page: PDFPage, texto: string, y: number, font: PDFFont, size: number, color = TEXTO) {
    const w = font.widthOfTextAtSize(texto, size);
    page.drawText(texto, { x: (ANCHO - w) / 2, y, size, font, color });
}

// Texto con separación entre letras (pdf-lib no la soporta directo)
function espaciado(page: PDFPage, texto: string, y: number, font: PDFFont, size: number, sep: number, color = TEXTO) {
    const total = [...texto].reduce((s, c) => s + font.widthOfTextAtSize(c, size) + sep, -sep);
    let x = (ANCHO - total) / 2;
    for (const c of texto) {
        page.drawText(c, { x, y, size, font, color });
        x += font.widthOfTextAtSize(c, size) + sep;
    }
}

// Reduce el tamaño hasta que quepa en el ancho
function ajustar(texto: string, font: PDFFont, size: number, max: number, min: number) {
    let s = size;
    while (s > min && font.widthOfTextAtSize(texto, s) > max) s -= 1;
    return s;
}

// Parte el texto en máximo 2 líneas
function lineas(texto: string, font: PDFFont, size: number, max: number): string[] {
    if (font.widthOfTextAtSize(texto, size) <= max) return [texto];
    const palabras = texto.split(' ');
    let primera = '';
    for (let i = 0; i < palabras.length; i++) {
        const prueba = primera ? `${primera} ${palabras[i]}` : palabras[i];
        if (font.widthOfTextAtSize(prueba, size) > max) {
            const resto = palabras.slice(i).join(' ');
            return [primera, resto];
        }
        primera = prueba;
    }
    return [primera];
}

export async function buildCertificatePdf(d: CertificateData): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Constancia ${d.folio}`);
    pdf.setAuthor(d.empresa);
    const page = pdf.addPage([ANCHO, ALTO]);

    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
    const timesB = await pdf.embedFont(StandardFonts.TimesRomanBold);

    // Marco doble y franja superior
    page.drawRectangle({ x: 32, y: 32, width: ANCHO - 64, height: ALTO - 64, borderColor: NAVY, borderWidth: 1.5 });
    page.drawRectangle({ x: 37, y: 37, width: ANCHO - 74, height: ALTO - 74, borderColor: CIAN, borderWidth: 0.6 });
    const franja = ANCHO - 64;
    page.drawRectangle({ x: 32, y: ALTO - 40, width: franja * 0.7, height: 8, color: NAVY });
    page.drawRectangle({ x: 32 + franja * 0.7, y: ALTO - 40, width: franja * 0.3, height: 8, color: CIAN });

    // Encabezado: logo + empresa, folio
    let xEmpresa = 80;
    if (d.logo) {
        try {
            const img: PDFImage = d.logo.tipo === 'png' ? await pdf.embedPng(d.logo.bytes) : await pdf.embedJpg(d.logo.bytes);
            const esc = img.scaleToFit(110, 40);
            page.drawImage(img, { x: 80, y: ALTO - 112, width: esc.width, height: esc.height });
            xEmpresa = 80 + esc.width + 12;
        } catch {
            // Logo inválido: se omite
        }
    }
    const tamEmpresa = ajustar(d.empresa, helvB, 12, 360, 8);
    page.drawText(d.empresa, { x: xEmpresa, y: ALTO - 98, size: tamEmpresa, font: helvB, color: NAVY });

    const wFolioLbl = helv.widthOfTextAtSize('Folio', 8.5);
    const wFolio = helvB.widthOfTextAtSize(d.folio, 10);
    page.drawText('Folio', { x: ANCHO - 80 - wFolioLbl, y: ALTO - 88, size: 8.5, font: helv, color: GRIS });
    page.drawText(d.folio, { x: ANCHO - 80 - wFolio, y: ALTO - 102, size: 10, font: helvB, color: NAVY });

    // Cuerpo
    espaciado(page, 'CAPACITACIÓN', 432, helvB, 9.5, 4.5, CIAN_TXT);
    centrado(page, 'Constancia de conclusión', 396, helvB, 29, NAVY);
    page.drawRectangle({ x: ANCHO / 2 - 25, y: 376, width: 50, height: 2.2, color: CIAN });

    centrado(page, 'Se otorga la presente a', 344, helv, 11, GRIS);
    const tamNombre = ajustar(d.empleado, timesB, 28, 600, 16);
    centrado(page, d.empleado, 310, timesB, tamNombre, TEXTO);
    centrado(page, 'por haber concluido satisfactoriamente el curso', 280, helv, 11, GRIS);

    const lineasCurso = lineas(d.curso, helvB, 17, 580);
    const tamCurso = lineasCurso.length > 1 ? 15 : 17;
    let yCurso = 252;
    for (const l of lineas(d.curso, helvB, tamCurso, 580).slice(0, 2)) {
        centrado(page, l, yCurso, helvB, ajustar(l, helvB, tamCurso, 600, 10), NAVY);
        yCurso -= tamCurso + 5;
    }

    if (d.fechaConclusion) {
        const lbl = 'Concluido el ';
        const wl = helv.widthOfTextAtSize(lbl, 10.5);
        const wf = helvB.widthOfTextAtSize(d.fechaConclusion, 10.5);
        const xf = (ANCHO - wl - wf) / 2;
        const yFecha = yCurso - 10;
        page.drawText(lbl, { x: xf, y: yFecha, size: 10.5, font: helv, color: GRIS });
        page.drawText(d.fechaConclusion, { x: xf + wl, y: yFecha, size: 10.5, font: helvB, color: TEXTO });
    }

    // Pie: firma, sello, emisión
    page.drawLine({ start: { x: 95, y: 112 }, end: { x: 290, y: 112 }, thickness: 0.8, color: NAVY });
    const firma = 'Área de Capacitación';
    page.drawText(firma, { x: 192.5 - helvB.widthOfTextAtSize(firma, 9.5) / 2, y: 98, size: 9.5, font: helvB, color: NAVY });
    const emp = d.empresa.length > 45 ? `${d.empresa.slice(0, 44)}…` : d.empresa;
    const tamEmp = ajustar(emp, helv, 8.5, 220, 6);
    page.drawText(emp, { x: 192.5 - helv.widthOfTextAtSize(emp, tamEmp) / 2, y: 86, size: tamEmp, font: helv, color: GRIS });

    const cx = ANCHO / 2;
    const cy = 112;
    page.drawCircle({ x: cx, y: cy, size: 32, borderColor: CIAN, borderWidth: 1.6 });
    page.drawCircle({ x: cx, y: cy, size: 27, color: NAVY });
    page.drawLine({ start: { x: cx - 6, y: cy + 6 }, end: { x: cx - 1.5, y: cy + 1.5 }, thickness: 2.2, color: BLANCO });
    page.drawLine({ start: { x: cx - 1.5, y: cy + 1.5 }, end: { x: cx + 7, y: cy + 10 }, thickness: 2.2, color: BLANCO });
    const sello = 'CONCLUIDO';
    page.drawText(sello, { x: cx - helvB.widthOfTextAtSize(sello, 6.5) / 2, y: cy - 10, size: 6.5, font: helvB, color: BLANCO });

    const e1 = `Emitida el ${d.fechaEmision}`;
    const e2 = 'Generada en TalentCore';
    page.drawText(e1, { x: 600 - helv.widthOfTextAtSize(e1, 8) / 2, y: 98, size: 8, font: helv, color: GRIS_CLARO });
    page.drawText(e2, { x: 600 - helv.widthOfTextAtSize(e2, 8) / 2, y: 87, size: 8, font: helv, color: GRIS_CLARO });

    return pdf.save();
}
