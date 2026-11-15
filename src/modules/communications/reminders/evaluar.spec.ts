import { localTimeToInstant, localWeekdayName } from 'src/modules/attendance/utils/timezone.util';
import { relojLocal } from './zona-reloj';
import {
    evaluarR1,
    evaluarR2,
    evaluarR3,
    evaluarR4,
    evaluarR5,
    evaluarR6,
    evaluarR7,
    evaluarR8,
    evaluarR9,
    evaluarR10,
    evaluarR11,
} from './evaluar';

const ZONA = 'America/Mexico_City';
const FECHA = '2026-11-16';
const DIA = localWeekdayName(
    localTimeToInstant(FECHA, new Date(Date.UTC(1970, 0, 1, 12, 0, 0)), ZONA),
    ZONA,
);
const AHORA = new Date('2026-11-16T18:00:00.000Z');

function instante(hora: string, zona = ZONA): Date {
    const [h, m] = hora.split(':').map(Number);
    return localTimeToInstant(FECHA, new Date(Date.UTC(1970, 0, 1, h, m, 0)), zona);
}

function turno(tieneEntrada = false, tieneSalida = false) {
    return { dia: DIA, horaEntrada: 9 * 60, horaSalida: 18 * 60, tieneEntrada, tieneSalida };
}

describe('recordatorios R1–R11', () => {
    it('R1 dispara antes de la entrada, se omite fuera de ventana y se cierra si ya checó', () => {
        const dentro = instante('08:50');
        const base = { ahora: dentro, zona: ZONA, companyId: 10, turno: turno(), previos: [] as const };
        expect(evaluarR1({ ...base, minutosAntes: 15 }).accion).toBe('enviar');
        expect(evaluarR1({ ...base, ahora: instante('08:20'), minutosAntes: 15 }).accion).toBe('omitir');
        expect(evaluarR1({ ...base, turno: turno(true), minutosAntes: 15 }).accion).toBe('cerrado');
    });

    it('R2 dispara después de la hora de entrada, se omite antes y se cierra con la checada', () => {
        const base = { ahora: instante('09:15'), zona: ZONA, companyId: 10, turno: turno(), previos: [] as const };
        expect(evaluarR2({ ...base, minutosDespues: 10 }).accion).toBe('enviar');
        expect(evaluarR2({ ...base, ahora: instante('09:05'), minutosDespues: 10 }).accion).toBe('omitir');
        expect(evaluarR2({ ...base, turno: turno(true), minutosDespues: 10 }).accion).toBe('cerrado');
    });

    it('R3 dispara tras la salida sin registro, se omite antes y se cierra si ya salió o no entró', () => {
        const base = {
            ahora: instante('18:40'),
            zona: ZONA,
            companyId: 10,
            turno: turno(true, false),
            previos: [] as const,
        };
        expect(evaluarR3({ ...base, minutosDespues: 30 }).accion).toBe('enviar');
        expect(evaluarR3({ ...base, ahora: instante('18:10'), minutosDespues: 30 }).accion).toBe('omitir');
        expect(evaluarR3({ ...base, turno: turno(true, true), minutosDespues: 30 }).accion).toBe('cerrado');
        expect(evaluarR3({ ...base, turno: turno(false, false), minutosDespues: 30 }).accion).toBe('cerrado');
    });

    it('R4 dispara si falta el documento, se omite si el intento es reciente y se cierra al cargarlo', () => {
        const base = { companyId: 10, idDocumento: 4, documento: 'INE', previos: [], ahora: AHORA };
        expect(evaluarR4({ ...base, faltante: true, cadaDias: 3, maxIntentos: 5 }).accion).toBe('enviar');
        expect(evaluarR4({
            ...base,
            faltante: true,
            cadaDias: 3,
            maxIntentos: 5,
            previos: [{ referencia: 'doc:4', intento: 1, enviadoEn: AHORA }],
        }).accion).toBe('omitir');
        expect(evaluarR4({ ...base, faltante: false, cadaDias: 3, maxIntentos: 5 }).accion).toBe('cerrado');
    });

    it('R5 dispara en el umbral, se omite si falta mucho y se cierra vencido', () => {
        const base = { companyId: 10, idDocumento: 5, documento: 'licencia', previos: [], ahora: AHORA, cerrado: false };
        expect(evaluarR5({ ...base, diasAntes: [30, 7, 1], diasRestantes: 7 }).accion).toBe('enviar');
        expect(evaluarR5({ ...base, diasAntes: [30, 7, 1], diasRestantes: 40 }).accion).toBe('omitir');
        expect(evaluarR5({ ...base, diasAntes: [30, 7, 1], diasRestantes: -1 }).accion).toBe('cerrado');
    });

    it('R6 dispara el rechazo, se omite antes del siguiente intento y se cierra si ya no está rechazado', () => {
        const base = { companyId: 10, idDocumento: 6, documento: 'comprobante', previos: [], ahora: AHORA };
        expect(evaluarR6({ ...base, rechazado: true, cadaDias: 2, maxIntentos: 5 }).accion).toBe('enviar');
        expect(evaluarR6({
            ...base,
            rechazado: true,
            cadaDias: 2,
            maxIntentos: 5,
            previos: [{ referencia: 'doc:6', intento: 1, enviadoEn: AHORA }],
        }).accion).toBe('omitir');
        expect(evaluarR6({ ...base, rechazado: false, cadaDias: 2, maxIntentos: 5 }).accion).toBe('cerrado');
    });

    it('R7 dispara el curso inscrito, se omite si ya avisó hoy y se cierra al terminarlo', () => {
        const base = { companyId: 10, idSesion: 7, curso: 'inducción', previos: [], ahora: AHORA };
        expect(evaluarR7({ ...base, estatus: 'inscrito', cadaDias: 1, maxIntentos: 3 }).accion).toBe('enviar');
        expect(evaluarR7({
            ...base,
            estatus: 'inscrito',
            cadaDias: 1,
            maxIntentos: 3,
            previos: [{ referencia: 'curso:7', intento: 1, enviadoEn: AHORA }],
        }).accion).toBe('omitir');
        expect(evaluarR7({ ...base, estatus: 'completado', cadaDias: 1, maxIntentos: 3 }).accion).toBe('cerrado');
    });

    it('R8 dispara por vencer o atrasado, se omite si falta tiempo y se cierra sin inscripción', () => {
        const base = { companyId: 10, idSesion: 8, curso: 'seguridad', estatus: 'inscrito', previos: [], ahora: AHORA };
        expect(evaluarR8({ ...base, diasAntes: 3, cadaDias: 1, maxIntentos: 5, diasRestantes: 2 }).accion).toBe('enviar');
        expect(evaluarR8({ ...base, diasAntes: 3, cadaDias: 1, maxIntentos: 5, diasRestantes: 10 }).accion).toBe('omitir');
        expect(evaluarR8({ ...base, estatus: 'completado', diasAntes: 3, cadaDias: 1, maxIntentos: 5, diasRestantes: 2 }).accion).toBe('cerrado');
        expect(evaluarR8({ ...base, diasAntes: 3, cadaDias: 1, maxIntentos: 5, diasRestantes: -1 }).referencia).toContain('atrasado');
    });

    it('R9 dispara el paso pendiente, se omite si acaba de avisar y se cierra al resolverlo', () => {
        const base = {
            companyId: 10,
            origen: 'INCIDENCIA',
            idSolicitud: 9,
            paso: 1,
            solicitud: 'incidencia',
            cadaDias: 1,
            maxIntentos: 5,
            previos: [],
            ahora: AHORA,
        };
        expect(evaluarR9({ ...base, estatus: 'PENDIENTE' }).accion).toBe('enviar');
        expect(evaluarR9({
            ...base,
            estatus: 'PENDIENTE',
            previos: [{ referencia: 'apr:INCIDENCIA:9:paso1', intento: 1, enviadoEn: AHORA }],
        }).accion).toBe('omitir');
        expect(evaluarR9({ ...base, estatus: 'APROBADA' }).accion).toBe('cerrado');
    });

    it('R10 dispara el cambio, se omite sin estatus y se cierra si ese estatus ya se avisó', () => {
        const base = { companyId: 10, origen: 'VACACION', idSolicitud: 10, solicitud: 'vacaciones', previos: [], ahora: AHORA };
        expect(evaluarR10({ ...base, estatus: 'APROBADA' }).accion).toBe('enviar');
        expect(evaluarR10({ ...base, estatus: '   ' }).accion).toBe('omitir');
        expect(evaluarR10({
            ...base,
            estatus: 'APROBADA',
            previos: [{ referencia: 'VACACION:10:APROBADA', intento: 1, enviadoEn: new Date(AHORA.getTime() - 86_400_000) }],
        }).accion).toBe('cerrado');
    });

    it('R11 usa cada días y máximo del comunicado, se omite sin config y se cierra con el acuse', () => {
        const base = {
            companyId: 10,
            idComunicado: 11,
            estadoComunicado: 'ENVIADO',
            acuseModo: 'LEI_ENTENDI',
            estadoDestinatario: 'LEIDO',
            vigente: true,
            solicitud: 'aviso',
            previos: [],
            ahora: AHORA,
        };
        expect(evaluarR11({ ...base, cadaDias: 2, maxIntentos: 3 }).accion).toBe('enviar');
        expect(evaluarR11({ ...base, cadaDias: null, maxIntentos: null }).accion).toBe('omitir');
        expect(evaluarR11({ ...base, estadoDestinatario: 'CONFIRMADO', cadaDias: 2, maxIntentos: 3 }).accion).toBe('cerrado');
    });

    it('la misma hora UTC cae en ventanas distintas según la zona del sitio', () => {
        const ahora = instante('08:50', ZONA);
        const ciudad = relojLocal(ahora, ZONA);
        const tijuana = relojLocal(ahora, 'America/Tijuana');
        expect(ciudad.minutos).not.toBe(tijuana.minutos);
        const base = { ahora, companyId: 10, turno: turno(), previos: [] as const, minutosAntes: 15 };
        expect(evaluarR1({ ...base, zona: ZONA }).accion).toBe('enviar');
        expect(evaluarR1({ ...base, zona: 'America/Tijuana' }).accion).toBe('omitir');
    });
});
