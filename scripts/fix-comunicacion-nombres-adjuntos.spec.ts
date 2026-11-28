import { aplicarReparacionNombres, NombresAdjuntosStore, repararNombreAdjunto } from './fix-comunicacion-nombres-adjuntos';

class Memoria implements NombresAdjuntosStore {
    filas: { idAdjunto: number; Nombre: string }[] = [];

    listarSospechosos() {
        return Promise.resolve(this.filas.filter((fila) => fila.Nombre.includes('Ã')).map((fila) => ({ ...fila })));
    }

    actualizarNombre(idAdjunto: number, nombre: string) {
        const fila = this.filas.find((item) => item.idAdjunto === idAdjunto);
        if (!fila) return Promise.reject(new Error('no existe'));
        fila.Nombre = nombre;
        return Promise.resolve();
    }
}

function comoMulter(nombre: string): string {
    return Buffer.from(nombre, 'utf8').toString('latin1');
}

describe('reparar nombres de adjuntos', () => {
    it('pasa Módulos, Implementación y Año de latin1 a UTF-8 y no los vuelve a tocar', () => {
        for (const visible of ['Módulos.pdf', 'Implementación.pdf', 'Año.pdf', 'Estructura por Módulos de Implementación.pdf']) {
            const mal = comoMulter(visible);
            expect(mal).toContain('Ã');
            expect(repararNombreAdjunto(mal)).toBe(visible);
            expect(repararNombreAdjunto(visible)).toBeNull();
        }
        expect(repararNombreAdjunto('nota.pdf')).toBeNull();
        expect(repararNombreAdjunto('Ãx')).toBeNull();
    });

    it('es idempotente y solo cuenta los que cambian', async () => {
        const memoria = new Memoria();
        memoria.filas = [
            { idAdjunto: 1, Nombre: comoMulter('Módulos.pdf') },
            { idAdjunto: 2, Nombre: comoMulter('Implementación.pdf') },
            { idAdjunto: 3, Nombre: 'Año.pdf' },
            { idAdjunto: 4, Nombre: comoMulter('Año.pdf') },
        ];
        await expect(aplicarReparacionNombres(memoria)).resolves.toBe(3);
        expect(memoria.filas.map((fila) => fila.Nombre)).toEqual(['Módulos.pdf', 'Implementación.pdf', 'Año.pdf', 'Año.pdf']);
        await expect(aplicarReparacionNombres(memoria)).resolves.toBe(0);
    });
});
