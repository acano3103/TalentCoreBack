import { HttpException, HttpStatus } from '@nestjs/common';
import { asegurarTipoPersonal, reemplazarEtiquetas } from './clasificacion-puesto';

describe('reemplazarEtiquetas', () => {
    const tx = {
        catEtiquetasPuesto: { findMany: jest.fn() },
        relPuestoEtiqueta: { deleteMany: jest.fn(), createMany: jest.fn() },
    };

    beforeEach(() => {
        jest.resetAllMocks();
        tx.relPuestoEtiqueta.deleteMany.mockResolvedValue({ count: 1 });
        tx.relPuestoEtiqueta.createMany.mockResolvedValue({ count: 1 });
    });

    it('borra el set anterior e inserta los ids nuevos, sin repetir', async () => {
        tx.catEtiquetasPuesto.findMany.mockResolvedValue([{ idEtiqueta: 2 }, { idEtiqueta: 3 }]);
        const orden: string[] = [];
        tx.relPuestoEtiqueta.deleteMany.mockImplementation(async () => {
            orden.push('delete');
        });
        tx.relPuestoEtiqueta.createMany.mockImplementation(async () => {
            orden.push('create');
        });

        await reemplazarEtiquetas(tx, 10, 4, [2, 2, 3]);

        expect(tx.catEtiquetasPuesto.findMany).toHaveBeenCalledWith({
            where: { idTenant: 4, idEtiqueta: { in: [2, 3] }, Activo: true },
            select: { idEtiqueta: true },
        });
        expect(tx.relPuestoEtiqueta.deleteMany).toHaveBeenCalledWith({ where: { idPuesto: 10 } });
        expect(tx.relPuestoEtiqueta.createMany).toHaveBeenCalledWith({
            data: [
                { idPuesto: 10, idEtiqueta: 2 },
                { idPuesto: 10, idEtiqueta: 3 },
            ],
        });
        expect(orden).toEqual(['delete', 'create']);
    });

    it('un arreglo vacío deja el puesto sin etiquetas', async () => {
        await reemplazarEtiquetas(tx, 10, 4, []);

        expect(tx.catEtiquetasPuesto.findMany).not.toHaveBeenCalled();
        expect(tx.relPuestoEtiqueta.deleteMany).toHaveBeenCalledWith({ where: { idPuesto: 10 } });
        expect(tx.relPuestoEtiqueta.createMany).not.toHaveBeenCalled();
    });

    it('si el campo no viene, no toca las etiquetas del puesto', async () => {
        await reemplazarEtiquetas(tx, 10, 4, undefined);

        expect(tx.catEtiquetasPuesto.findMany).not.toHaveBeenCalled();
        expect(tx.relPuestoEtiqueta.deleteMany).not.toHaveBeenCalled();
        expect(tx.relPuestoEtiqueta.createMany).not.toHaveBeenCalled();
    });

    it('rechaza ids de otro tenant o inactivos y no borra el set', async () => {
        tx.catEtiquetasPuesto.findMany.mockResolvedValue([{ idEtiqueta: 2 }]);

        await expect(reemplazarEtiquetas(tx, 10, 4, [2, 99])).rejects.toBeInstanceOf(HttpException);

        try {
            await reemplazarEtiquetas(tx, 10, 4, [2, 99]);
        } catch (error) {
            const http = error as HttpException;
            expect(http.getStatus()).toBe(HttpStatus.BAD_REQUEST);
            expect(http.getResponse()).toEqual({
                code: 'CONTENIDO_INVALIDO',
                message: 'Hay etiquetas que no existen o no están activas.',
                detail: { ids: [99] },
            });
        }

        expect(tx.relPuestoEtiqueta.deleteMany).not.toHaveBeenCalled();
        expect(tx.relPuestoEtiqueta.createMany).not.toHaveBeenCalled();
    });
});

describe('asegurarTipoPersonal', () => {
    it('rechaza un tipo que no está activo en el tenant', async () => {
        const tx = { catTiposPersonal: { findFirst: jest.fn().mockResolvedValue(null) } };

        await expect(asegurarTipoPersonal(tx, 4, 8)).rejects.toMatchObject({
            status: HttpStatus.BAD_REQUEST,
        });
        expect(tx.catTiposPersonal.findFirst).toHaveBeenCalledWith({
            where: { idTipoPersonal: 8, idTenant: 4, Activo: true },
            select: { idTipoPersonal: true },
        });
    });
});
