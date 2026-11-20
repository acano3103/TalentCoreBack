import * as ExcelJS from 'exceljs';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import {
    COLUMNAS_EVIDENCIA,
    curvaDesdeFechas,
    desgloseDe,
    fechaLocal,
    filasEvidencia,
    filtroReenvio,
    kpisDe,
    porCanalDePersonas,
} from './analitica';

const enviado = new Date('2026-11-01T00:00:00.000Z');

describe('analítica de un comunicado', () => {
    it('calcula los KPIs de una semilla conocida', () => {
        expect(
            kpisDe([
                { estado: 'PENDIENTE', total: 3 },
                { estado: 'ENTREGADO', total: 2 },
                { estado: 'LEIDO', total: 2 },
                { estado: 'CONFIRMADO', total: 1 },
                { estado: 'FALLIDO', total: 1 },
                { estado: 'SIN_CANAL', total: 1 },
            ]),
        ).toEqual({
            destinatarios: 10,
            entregados: 5,
            leidos: 3,
            acuses: 1,
            pendientes: 5,
            expirados: 0,
            fallidosPorMotivo: [
                { motivo: 'FALLIDO', etiqueta: 'No se pudo entregar', total: 1 },
                { motivo: 'SIN_CANAL', etiqueta: 'Sin canal de contacto', total: 1 },
            ],
        });
    });

    it('acumula lectura y acuse en 12 cortes de las primeras 72 horas', () => {
        const curva = curvaDesdeFechas(
            enviado,
            [
                new Date(enviado.getTime() + 60 * 60 * 1000),
                new Date(enviado.getTime() + 6 * 60 * 60 * 1000),
                new Date(enviado.getTime() + 73 * 60 * 60 * 1000),
                new Date(enviado.getTime() - 1000),
            ],
            [new Date(enviado.getTime() + 71 * 60 * 60 * 1000), new Date(enviado.getTime() + 72 * 60 * 60 * 1000)],
        );
        expect(curva).toHaveLength(12);
        expect(curva.map((punto) => punto.hora)).toEqual([6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72]);
        expect(curva[0]).toMatchObject({ lecturas: 1, acuses: 0 });
        expect(curva[1]).toMatchObject({ lecturas: 2, acuses: 0 });
        expect(curva[10]).toMatchObject({ lecturas: 2, acuses: 0 });
        expect(curva[11]).toMatchObject({ lecturas: 2, acuses: 2 });
    });

    it('deja la curva en cero si el comunicado no se ha enviado', () => {
        expect(curvaDesdeFechas(null, [enviado], [enviado]).every((punto) => punto.lecturas === 0 && punto.acuses === 0)).toBe(true);
    });

    it('mide entrega y lectura por canal', () => {
        expect(
            porCanalDePersonas([
                { estado: 'LEIDO', canales: ['APP', 'WEB'] },
                { estado: 'PENDIENTE', canales: ['APP'] },
                { estado: 'CONFIRMADO', canales: ['WHATSAPP'] },
                { estado: 'SIN_CANAL', canales: [] },
            ]),
        ).toEqual([
            { canal: 'APP', destinatarios: 2, entregados: 1, porcentajeEntrega: 50, porcentajeLectura: 50 },
            { canal: 'WEB', destinatarios: 1, entregados: 1, porcentajeEntrega: 100, porcentajeLectura: 100 },
            { canal: 'WHATSAPP', destinatarios: 1, entregados: 1, porcentajeEntrega: 100, porcentajeLectura: 100 },
        ]);
    });

    it('agrupa por el id congelado', () => {
        const grupos = desgloseDe(
            [
                { id: 1, estado: 'LEIDO', total: 1 },
                { id: 1, estado: 'CONFIRMADO', total: 1 },
                { id: 1, estado: 'PENDIENTE', total: 1 },
                { id: 2, estado: 'PENDIENTE', total: 1 },
                { id: null, estado: 'ENTREGADO', total: 1 },
            ],
            new Map([[1, 'Norte']]),
            'site',
        );
        expect(grupos[0]).toMatchObject({
            id: 1,
            nombre: 'Norte',
            destinatarios: 3,
            porcentajeLectura: 66.7,
            porcentajeAcuse: 33.3,
            pendientes: 1,
        });
        expect(grupos.find((grupo) => grupo.id == null)?.nombre).toBe('Sin ubicación');
    });

    it('reenvía solo a pendientes y, si es una ubicación, usa el id congelado', () => {
        expect(filtroReenvio(9, 'PENDIENTES')).toEqual({ idComunicado: 9, Estado: 'PENDIENTE' });
        expect(filtroReenvio(9, 'SITE', 4)).toEqual({ idComunicado: 9, Estado: 'PENDIENTE', idSite: 4 });
        expect(filtroReenvio(9, 'PENDIENTES')).not.toHaveProperty('idSite');
    });

    it('escribe la evidencia con la hora local de la zona del acuse', () => {
        expect(fechaLocal(new Date('2026-11-14T18:30:00.000Z'), 'America/Mexico_City')).toBe('14/11/2026 12:30:00');
        const filas = filasEvidencia([
            {
                colaborador: 'Ana López',
                ubicacion: 'Norte',
                estado: 'CONFIRMADO',
                acuses: [
                    {
                        fechaUtc: new Date('2026-11-14T18:30:00.000Z'),
                        zonaHoraria: 'America/Mexico_City',
                        canal: 'APP',
                        metodo: 'SESION',
                        ip: '10.0.0.8',
                        dispositivo: 'Pixel',
                        version: 2,
                    },
                    {
                        fechaUtc: new Date('2026-11-14T19:00:00.000Z'),
                        zonaHoraria: 'America/Mexico_City',
                        canal: 'WEB',
                        metodo: 'SESION',
                        ip: null,
                        dispositivo: null,
                        version: 3,
                    },
                ],
            },
            { colaborador: 'Luis Pérez', ubicacion: 'Sur', estado: 'PENDIENTE', acuses: [] },
        ]);
        expect(filas).toHaveLength(3);
        expect(filas[0]).toMatchObject({ fechaHoraLocal: '14/11/2026 12:30:00', canal: 'APP', metodo: 'SESION', ip: '10.0.0.8', version: 2 });
        expect(filas[2]).toMatchObject({ colaborador: 'Luis Pérez', fechaHoraLocal: '', canal: '', version: '' });
    });

    it('exporta las columnas de la evidencia', async () => {
        const buffer = await new ExcelExportService().generate({
            sheetName: 'Acuses',
            columns: COLUMNAS_EVIDENCIA.map((columna) => ({ ...columna })),
            rows: filasEvidencia([
                {
                    colaborador: 'Ana López',
                    ubicacion: 'Norte',
                    estado: 'CONFIRMADO',
                    acuses: [
                        {
                            fechaUtc: new Date('2026-11-14T18:30:00.000Z'),
                            zonaHoraria: 'America/Mexico_City',
                            canal: 'APP',
                            metodo: 'SESION',
                            ip: '10.0.0.8',
                            dispositivo: 'Pixel',
                            version: 2,
                        },
                    ],
                },
            ]),
        });
        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);
        const hoja = libro.getWorksheet('Acuses');
        const encabezados = hoja?.getRow(1).values;
        expect(encabezados).toEqual([
            undefined,
            'Colaborador',
            'Ubicación',
            'Estado',
            'Fecha y hora local',
            'Canal',
            'Método',
            'IP',
            'Dispositivo',
            'Versión',
        ]);
        expect(hoja?.getRow(2).getCell(4).value).toBe('14/11/2026 12:30:00');
        expect(hoja?.getRow(2).getCell(9).value).toBe(2);
    });
});
