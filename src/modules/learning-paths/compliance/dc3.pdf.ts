import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

/**
 * Formato DC-3 (constancia de competencias o de habilidades laborales).
 * La base técnica es la misma que course-certificate.pdf.ts: pdf-lib,
 * Helvetica y medidas en puntos sobre carta.
 */
export interface Dc3PdfDatos {
  folio: string;
  trabajador: string;
  curp: string;
  puesto: string;
  razonSocial: string;
  rfc: string;
  registroPatronal: string;
  curso: string;
  duracionHoras: string;
  periodoInicio: string;
  periodoFin: string;
  areaTematica: string;
  agenteCapacitador: string;
}

const NAVY = rgb(15 / 255, 42 / 255, 74 / 255);
const TEXTO = rgb(15 / 255, 23 / 255, 42 / 255);
const GRIS = rgb(71 / 255, 85 / 255, 105 / 255);
const LINEA = rgb(203 / 255, 213 / 255, 225 / 255);

const ANCHO = 612;
const ALTO = 792;
const MARGEN = 48;

export async function buildDc3Pdf(datos: Dc3PdfDatos): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`DC-3 ${datos.folio}`);
  pdf.setAuthor(datos.razonSocial);
  const page = pdf.addPage([ANCHO, ALTO]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 28,
    y: 28,
    width: ANCHO - 56,
    height: ALTO - 56,
    borderColor: NAVY,
    borderWidth: 1.2,
  });

  let y = ALTO - 64;
  y = titulo(page, 'CONSTANCIA DE COMPETENCIAS', y, negrita, 13);
  y = titulo(page, 'O DE HABILIDADES LABORALES', y - 4, negrita, 13);
  y = titulo(page, 'Formato DC-3', y - 2, regular, 10, GRIS);
  y -= 8;
  dato(page, 'Folio', datos.folio, MARGEN, y, regular, negrita);
  y -= 28;

  y = seccion(page, 'Datos del trabajador', y, negrita);
  y = fila(page, 'Nombre', datos.trabajador, y, regular, negrita);
  y = fila(page, 'CURP', datos.curp, y, regular, negrita);
  y = fila(
    page,
    'Ocupación específica (puesto)',
    datos.puesto,
    y,
    regular,
    negrita,
  );

  y = seccion(page, 'Datos de la empresa', y - 8, negrita);
  y = fila(
    page,
    'Nombre o razón social',
    datos.razonSocial,
    y,
    regular,
    negrita,
  );
  y = fila(page, 'RFC', datos.rfc, y, regular, negrita);
  y = fila(
    page,
    'Registro patronal ante el IMSS',
    datos.registroPatronal,
    y,
    regular,
    negrita,
  );

  y = seccion(page, 'Datos del programa de capacitación', y - 8, negrita);
  y = fila(page, 'Nombre del curso', datos.curso, y, regular, negrita);
  y = fila(page, 'Duración en horas', datos.duracionHoras, y, regular, negrita);
  y = fila(
    page,
    'Periodo de ejecución',
    `${datos.periodoInicio} al ${datos.periodoFin}`,
    y,
    regular,
    negrita,
  );
  y = fila(page, 'Área temática', datos.areaTematica, y, regular, negrita);
  y = fila(
    page,
    'Agente capacitador',
    datos.agenteCapacitador,
    y,
    regular,
    negrita,
  );

  const pie = 'El patrón conserva esta constancia y la entrega al trabajador.';
  page.drawText(pie, {
    x: MARGEN,
    y: 48,
    size: 8,
    font: regular,
    color: GRIS,
  });

  return pdf.save();
}

function titulo(
  page: PDFPage,
  texto: string,
  y: number,
  font: PDFFont,
  size: number,
  color = NAVY,
): number {
  const ancho = font.widthOfTextAtSize(texto, size);
  page.drawText(texto, {
    x: (ANCHO - ancho) / 2,
    y,
    size,
    font,
    color,
  });
  return y - size - 6;
}

function seccion(
  page: PDFPage,
  texto: string,
  y: number,
  font: PDFFont,
): number {
  page.drawText(texto, { x: MARGEN, y, size: 11, font, color: NAVY });
  page.drawLine({
    start: { x: MARGEN, y: y - 4 },
    end: { x: ANCHO - MARGEN, y: y - 4 },
    thickness: 0.6,
    color: LINEA,
  });
  return y - 22;
}

function fila(
  page: PDFPage,
  etiqueta: string,
  valor: string,
  y: number,
  regular: PDFFont,
  negrita: PDFFont,
): number {
  page.drawText(etiqueta, {
    x: MARGEN,
    y,
    size: 8,
    font: regular,
    color: GRIS,
  });
  const lineas = partir(valor, negrita, 10, ANCHO - MARGEN * 2);
  let cursor = y - 14;
  for (const linea of lineas) {
    page.drawText(linea, {
      x: MARGEN,
      y: cursor,
      size: 10,
      font: negrita,
      color: TEXTO,
    });
    cursor -= 13;
  }
  return cursor - 8;
}

function dato(
  page: PDFPage,
  etiqueta: string,
  valor: string,
  x: number,
  y: number,
  regular: PDFFont,
  negrita: PDFFont,
) {
  page.drawText(etiqueta, { x, y, size: 8, font: regular, color: GRIS });
  page.drawText(valor, {
    x: x + regular.widthOfTextAtSize(etiqueta, 8) + 8,
    y,
    size: 10,
    font: negrita,
    color: TEXTO,
  });
}

function partir(
  texto: string,
  font: PDFFont,
  size: number,
  max: number,
): string[] {
  const palabras = (texto || '-').split(/\s+/);
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(prueba, size) > max && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.slice(0, 3);
}
