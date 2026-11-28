import { estadoPaginaPublica, ventanaAsistencia } from './ventana-asistencia';

const INICIO = new Date('2026-11-20T18:00:00.000Z');
const FIN = new Date('2026-11-20T19:00:00.000Z');

describe('ventanaAsistencia', () => {
    it('abre con la tolerancia antes del inicio y cierra al terminar', () => {
        const antes = ventanaAsistencia({
            fechaHoraInicio: INICIO,
            fechaHoraFin: FIN,
            minutosToleranciaQr: 15,
            ahora: new Date(INICIO.getTime() - 15 * 60_000 - 1),
        });
        const justo = ventanaAsistencia({
            fechaHoraInicio: INICIO,
            fechaHoraFin: FIN,
            minutosToleranciaQr: 15,
            ahora: new Date(INICIO.getTime() - 15 * 60_000),
        });
        const alCierre = ventanaAsistencia({
            fechaHoraInicio: INICIO,
            fechaHoraFin: FIN,
            minutosToleranciaQr: 15,
            ahora: FIN,
        });
        const despues = ventanaAsistencia({
            fechaHoraInicio: INICIO,
            fechaHoraFin: FIN,
            minutosToleranciaQr: 15,
            ahora: new Date(FIN.getTime() + 1),
        });

        expect(antes.estado).toBe('no_iniciada');
        expect(antes.desde.toISOString()).toBe('2026-11-20T17:45:00.000Z');
        expect(antes.hasta.toISOString()).toBe(FIN.toISOString());
        expect(antes.mensaje).toBe(
            `El pase de lista estará disponible 15 minutos antes del inicio (${INICIO.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}).`,
        );
        expect(justo.estado).toBe('abierta');
        expect(justo.mensaje).toBe('Pase de lista abierto.');
        expect(alCierre.estado).toBe('abierta');
        expect(despues.estado).toBe('cerrada');
        expect(despues.mensaje).toBe(
            `La clase finalizó a las ${FIN.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.`,
        );
    });

    it('sin tolerancia configurada usa 15 minutos, y una tolerancia propia corre la apertura', () => {
        const amplia = ventanaAsistencia({
            fechaHoraInicio: INICIO,
            fechaHoraFin: FIN,
            minutosToleranciaQr: 30,
            ahora: new Date('2026-11-20T17:40:00.000Z'),
        });
        const porDefecto = ventanaAsistencia({
            fechaHoraInicio: INICIO,
            fechaHoraFin: FIN,
            minutosToleranciaQr: null,
            ahora: new Date('2026-11-20T17:40:00.000Z'),
        });
        const cero = ventanaAsistencia({
            fechaHoraInicio: INICIO,
            fechaHoraFin: FIN,
            minutosToleranciaQr: 0,
            ahora: new Date('2026-11-20T17:40:00.000Z'),
        });

        expect(amplia.estado).toBe('abierta');
        expect(amplia.desde.toISOString()).toBe('2026-11-20T17:30:00.000Z');
        expect(porDefecto.estado).toBe('no_iniciada');
        expect(cero.estado).toBe('no_iniciada');
        expect(cero.mensaje).toContain('15 minutos');
    });

    it('la página pública conserva los estados de siempre', () => {
        expect(estadoPaginaPublica('no_iniciada')).toBe('not_started');
        expect(estadoPaginaPublica('abierta')).toBe('active');
        expect(estadoPaginaPublica('cerrada')).toBe('finished');
    });
});
