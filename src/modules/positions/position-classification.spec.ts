import { adjuntarClasificacionEnFila, presentarPuesto } from './position-classification';

describe('clasificación en la respuesta de puestos', () => {
    it('agrega tipoPersonal y etiquetas sin quitar los campos que ya venían', () => {
        const fila = adjuntarClasificacionEnFila(
            {
                idPuesto: 4,
                NombrePuesto: 'Cajero',
                Area: 'Tienda',
                idTipoPersonalClasificacion: 2,
                codigoTipoPersonal: 'OPERATIVO',
                nombreTipoPersonal: 'Operativo',
            },
            [{ id: 9, nombre: 'Turno noche' }],
        );

        expect(fila).toEqual({
            idPuesto: 4,
            NombrePuesto: 'Cajero',
            Area: 'Tienda',
            tipoPersonal: { id: 2, codigo: 'OPERATIVO', nombre: 'Operativo' },
            etiquetas: [{ id: 9, nombre: 'Turno noche' }],
        });
        expect(fila).not.toHaveProperty('idTipoPersonalClasificacion');
    });

    it('deja tipoPersonal en null cuando el puesto todavía no está clasificado', () => {
        const fila = adjuntarClasificacionEnFila(
            {
                idPuesto: 4,
                NombrePuesto: 'Cajero',
                idTipoPersonalClasificacion: null,
                codigoTipoPersonal: null,
                nombreTipoPersonal: null,
            },
            [],
        );

        expect(fila.tipoPersonal).toBeNull();
        expect(fila.etiquetas).toEqual([]);
        expect(fila.NombrePuesto).toBe('Cajero');
    });

    it('el detalle del puesto conserva los escalares y ordena las etiquetas', () => {
        const puesto = presentarPuesto({
            idPuesto: 4,
            NombrePuesto: 'Cajero',
            idTipoPersonal: 2,
            CatTiposPersonal: { idTipoPersonal: 2, Codigo: 'OPERATIVO', Nombre: 'Operativo' },
            RelPuestoEtiqueta: [
                { CatEtiquetasPuesto: { idEtiqueta: 3, Nombre: 'Zona' } },
                { CatEtiquetasPuesto: { idEtiqueta: 1, Nombre: 'Caja' } },
            ],
        });

        expect(puesto).toEqual({
            idPuesto: 4,
            NombrePuesto: 'Cajero',
            idTipoPersonal: 2,
            tipoPersonal: { id: 2, codigo: 'OPERATIVO', nombre: 'Operativo' },
            etiquetas: [
                { id: 1, nombre: 'Caja' },
                { id: 3, nombre: 'Zona' },
            ],
        });
    });
});
