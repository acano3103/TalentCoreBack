import { readFileSync } from 'fs';
import { join } from 'path';

/** Misma secuencia que la migración: primero se libera el código de destino. */
function renumerarCodigos(codigos: readonly string[]): string[] {
    return codigos.map((codigo) => {
        if (codigo === 'R1') return 'R12';
        if (codigo === 'R2') return 'R1';
        if (codigo === 'R3') return 'R2';
        return codigo;
    });
}

function renumerarOrigen(origenId: string): string {
    if (origenId.startsWith('R1:') && !origenId.startsWith('R10:') && !origenId.startsWith('R11:') && !origenId.startsWith('R12:')) {
        return `R12:${origenId.slice(3)}`;
    }
    if (origenId.startsWith('R2:')) return `R1:${origenId.slice(3)}`;
    if (origenId.startsWith('R3:')) return `R2:${origenId.slice(3)}`;
    return origenId;
}

describe('renumeración de recordatorios', () => {
    it('pasa los códigos previos a R12, R1 y R2 sin tocar el resto', () => {
        expect(renumerarCodigos(['R1', 'R2', 'R3', 'R4', 'R10', 'R11'])).toEqual(['R12', 'R1', 'R2', 'R4', 'R10', 'R11']);
    });

    it('cambia el prefijo de OrigenId y deja R10, R11 y R12 quietos', () => {
        expect(renumerarOrigen('R1:2026-11-16:540')).toBe('R12:2026-11-16:540');
        expect(renumerarOrigen('R2:2026-11-16:540')).toBe('R1:2026-11-16:540');
        expect(renumerarOrigen('R3:2026-11-16:1080')).toBe('R2:2026-11-16:1080');
        expect(renumerarOrigen('R10:solicitud')).toBe('R10:solicitud');
        expect(renumerarOrigen('R11:com:9')).toBe('R11:com:9');
    });

    it('la migración aplica ese orden dentro de las tres tablas', () => {
        const sql = readFileSync(
            join(__dirname, '../../../../prisma/migrations/20261116100200_ca15_destino_y_renumera_recordatorios/migration.sql'),
            'utf8',
        );
        const reglas = [...sql.matchAll(/UPDATE `ComReglasRecordatorio` SET `Codigo` = '([^']+)' WHERE `Codigo` = '([^']+)'/g)];
        const enviados = [...sql.matchAll(/UPDATE `ComRecordatoriosEnviados` SET `Codigo` = '([^']+)' WHERE `Codigo` = '([^']+)'/g)];
        const esperados = [['R12', 'R1'], ['R1', 'R2'], ['R2', 'R3']];
        expect(reglas.map((fila) => [fila[1], fila[2]])).toEqual(esperados);
        expect(enviados.map((fila) => [fila[1], fila[2]])).toEqual(esperados);
        expect(sql.indexOf("CONCAT('R12:'")).toBeLessThan(sql.indexOf("CONCAT('R1:'"));
        expect(sql.indexOf("CONCAT('R1:'")).toBeLessThan(sql.indexOf("CONCAT('R2:'"));
    });
});
