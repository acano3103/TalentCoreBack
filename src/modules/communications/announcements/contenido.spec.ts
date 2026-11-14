import { HttpException } from '@nestjs/common';
import { LIMITE_AVISO, LIMITE_TITULO, armarRevision, prepararContenido } from './contenido';

function codigo(error: unknown): string | undefined {
    return error instanceof HttpException && typeof error.getResponse() === 'object'
        ? (error.getResponse() as { code?: string }).code
        : undefined;
}

describe('contenido del comunicado', () => {
    it('rechaza título largo y un aviso de más de 500 caracteres', () => {
        expect(
            codigo(capturar(() => prepararContenido({ titulo: 'a'.repeat(LIMITE_TITULO + 1), resumen: 'r', cuerpoHtml: '<p>x</p>' }, false, false))),
        ).toBe('CONTENIDO_INVALIDO');
        expect(
            codigo(
                capturar(() =>
                    prepararContenido({ titulo: 'Aviso', resumen: 'Hoy', cuerpoHtml: 'a'.repeat(LIMITE_AVISO + 1) }, true, false),
                ),
            ),
        ).toBe('CONTENIDO_INVALIDO');
    });

    it('guarda el aviso como texto plano', () => {
        const listo = prepararContenido({ titulo: 'Aviso', resumen: 'Hoy', cuerpoHtml: '<p>Llega <b>tarde</b></p>' }, true, true);
        expect(listo.cuerpoHtml).toBe('Llega tarde');
    });

    it('arma el checklist sin tope de WhatsApp', () => {
        const vacio = armarRevision(base({ total: 0 }));
        expect(vacio.listo).toBe(false);
        expect(vacio.whatsapp.tope).toBeNull();
        expect(vacio.contenido.faltantes).toEqual([]);

        const sinPlantilla = armarRevision(base({ canalesForzados: ['WHATSAPP'], plantillasWhatsApp: null }));
        expect(sinPlantilla.listo).toBe(false);
        expect(sinPlantilla.whatsapp.aplica).toBe(true);

        const listo = armarRevision(base({}));
        expect(listo.listo).toBe(true);
        expect(listo.audiencia.sinCanal).toBe(1);
    });
});

function base(parcial: {
    total?: number;
    canalesForzados?: string[];
    plantillasWhatsApp?: unknown;
}) {
    return {
        total: parcial.total ?? 3,
        sinCanal: 1,
        porCanal: { APP: 2, WHATSAPP: 0, CORREO: 0, KIOSCO: 0, SIN_CANAL: 1 },
        fueraDeAlcance: [],
        canalesForzados: parcial.canalesForzados ?? [],
        plantillasWhatsApp: parcial.plantillasWhatsApp === undefined ? { general: 'tpl_ok' } : parcial.plantillasWhatsApp,
        vigenteHasta: new Date('2026-12-01T00:00:00Z'),
        ahora: new Date('2026-11-14T00:00:00Z'),
        esAviso: false,
        titulo: 'Título',
        resumen: 'Resumen',
        cuerpo: '<p>Cuerpo</p>',
    };
}

function capturar(fn: () => unknown): unknown {
    try {
        fn();
        return undefined;
    } catch (error) {
        return error;
    }
}
