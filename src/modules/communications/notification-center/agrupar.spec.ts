import { agruparAvisos, grupoTiempo, tituloAgrupado } from './agrupar';

const ahora = new Date('2026-11-14T18:00:00.000Z');
const zona = 'America/Mexico_City';

function aviso(parcial: Partial<Parameters<typeof agruparAvisos>[0][number]> & { id: string }) {
    return {
        titulo: 'Recordatorio de capacitación',
        mensaje: 'Te falta un curso',
        categoria: 'RECORDATORIO',
        prioridad: 'NORMAL',
        deepLink: null,
        origenTipo: 'RECORDATORIO',
        origenId: 'curso-1',
        claveAgrupacion: null,
        creadoEn: ahora,
        leidaEn: null,
        ...parcial,
    };
}

describe('agrupar avisos', () => {
    it('junta los repetidos del mismo día en un solo título', () => {
        const resultado = agruparAvisos(
            [
                aviso({ id: 'a', creadoEn: new Date('2026-11-14T16:00:00.000Z'), claveAgrupacion: 'cap' }),
                aviso({ id: 'b', creadoEn: new Date('2026-11-14T15:00:00.000Z'), claveAgrupacion: 'cap' }),
                aviso({ id: 'c', creadoEn: new Date('2026-11-14T14:00:00.000Z'), claveAgrupacion: 'cap' }),
            ],
            ahora,
            zona,
            1,
            20,
        );
        expect(resultado.total).toBe(1);
        expect(resultado.grupos).toEqual([
            {
                nombre: 'Hoy',
                items: [
                    expect.objectContaining({
                        id: 'a',
                        ids: ['a', 'b', 'c'],
                        cantidad: 3,
                        titulo: '3 recordatorios de capacitación',
                        leida: false,
                    }),
                ],
            },
        ]);
    });

    it('separa hoy, esta semana y anteriores según la zona del empleado', () => {
        expect(grupoTiempo(new Date('2026-11-15T05:30:00.000Z'), ahora, zona)).toBe('Hoy');
        expect(grupoTiempo(new Date('2026-11-10T18:00:00.000Z'), ahora, zona)).toBe('Esta semana');
        expect(grupoTiempo(new Date('2026-11-08T18:00:00.000Z'), ahora, zona)).toBe('Anteriores');
        expect(tituloAgrupado(1, 'Recordatorio de capacitación')).toBe('Recordatorio de capacitación');
    });
});
