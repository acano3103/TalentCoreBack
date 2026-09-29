import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';

/**
 * Definición de una columna del Excel.
 * - key: propiedad del objeto a leer (si no se usa `value`).
 * - value: función opcional para calcular/formatear el valor de la celda.
 */
export interface ExcelColumn<T = any> {
    header: string;
    key: string;
    width?: number;
    value?: (row: T) => string | number | Date | boolean | null | undefined;
}

export interface ExcelExportOptions<T = any> {
    sheetName: string;
    columns: ExcelColumn<T>[];
    rows: T[];
}

/**
 * Servicio reutilizable para exportar información a Excel con el estilo
 * corporativo de Talent Core (mismo estilo que las plantillas de carga masiva).
 *
 * Uso en cualquier módulo:
 *   1. Importar ExcelExportModule en el módulo.
 *   2. Inyectar ExcelExportService.
 *   3. const buffer = await this.excelExportService.generate({ sheetName, columns, rows });
 *   4. this.excelExportService.send(res, buffer, 'Nombre_Archivo');
 */
@Injectable()
export class ExcelExportService {
    async generate<T>({ sheetName, columns, rows }: ExcelExportOptions<T>): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Talent Core';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet(sheetName);

        sheet.columns = columns.map((col) => ({
            header: col.header,
            key: col.key,
            width: col.width ?? 20,
        }));

        // Encabezado con el estilo corporativo (Slate 800, texto blanco negrita)
        const headerRow = sheet.getRow(1);
        headerRow.height = 28;
        headerRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Filas de datos
        rows.forEach((row) => {
            const rowData: Record<string, any> = {};
            columns.forEach((col) => {
                rowData[col.key] = col.value ? col.value(row) : (row as any)[col.key];
            });
            sheet.addRow(rowData).alignment = { vertical: 'middle', horizontal: 'left' };
        });

        // Encabezado fijo al hacer scroll y filtros de Excel en cada columna
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: columns.length },
        };

        const uint8Array = await workbook.xlsx.writeBuffer();
        return Buffer.from(uint8Array);
    }

    /**
     * Envía el buffer como archivo descargable.
     * Agrega la fecha al nombre: Empresas_2026-09-28.xlsx
     */
    send(res: Response, buffer: Buffer, baseFilename: string) {
        const fecha = new Date().toISOString().split('T')[0];
        const filename = `${baseFilename}_${fecha}.xlsx`;

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }
}