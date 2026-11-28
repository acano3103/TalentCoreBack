import {
    aplicarSemillas,
    CAPACIDADES,
    CAPACIDADES_FASE_2,
    clavePrecioGlobal,
    filasFaltantes,
    FilaCanal,
    FilaCapacidad,
    FilaPrecioGlobal,
    FilaTipoComunicado,
    FilaTipoNotificacion,
    FilaTipoPersonal,
    PRECIO_WA_GLOBAL,
    SemillaStore,
    TIPOS_COMUNICADO,
} from './seed-comunicacion-catalogos';

class MemoriaSemillas implements SemillaStore {
    tenants: number[] = [];
    tiposPersonal: FilaTipoPersonal[] = [];
    tiposComunicado: FilaTipoComunicado[] = [];
    capacidades: FilaCapacidad[] = [];
    canales: FilaCanal[] = [];
    tiposNotificacion: FilaTipoNotificacion[] = [];
    precios: FilaPrecioGlobal[] = [];

    listarTenants() {
        return Promise.resolve([...this.tenants]);
    }
    listarTiposPersonal() {
        return Promise.resolve(this.tiposPersonal.map((fila) => ({ ...fila })));
    }
    insertarTiposPersonal(filas: FilaTipoPersonal[]) {
        this.tiposPersonal.push(...filas);
        return Promise.resolve();
    }
    listarTiposComunicado() {
        return Promise.resolve(this.tiposComunicado.map((fila) => ({ ...fila })));
    }
    insertarTiposComunicado(filas: FilaTipoComunicado[]) {
        this.tiposComunicado.push(...filas);
        return Promise.resolve();
    }
    listarCapacidades() {
        return Promise.resolve(this.capacidades.map((fila) => ({ codigo: fila.codigo })));
    }
    insertarCapacidades(filas: FilaCapacidad[]) {
        this.capacidades.push(...filas);
        return Promise.resolve();
    }
    listarCanales() {
        return Promise.resolve(this.canales.map((fila) => ({ code: fila.code })));
    }
    insertarCanales(filas: FilaCanal[]) {
        this.canales.push(...filas);
        return Promise.resolve();
    }
    listarTiposNotificacion() {
        return Promise.resolve(this.tiposNotificacion.map((fila) => ({ code: fila.code })));
    }
    insertarTiposNotificacion(filas: FilaTipoNotificacion[]) {
        this.tiposNotificacion.push(...filas);
        return Promise.resolve();
    }
    listarPreciosGlobales() {
        return Promise.resolve(this.precios.map((fila) => ({ vigenteDesde: fila.vigenteDesde })));
    }
    insertarPreciosGlobales(filas: FilaPrecioGlobal[]) {
        this.precios.push(...filas);
        return Promise.resolve();
    }
}

describe('semillas de comunicación', () => {
    it('no inserta una clave que ya existe y descarta duplicados del lote', () => {
        const nuevas = filasFaltantes(
            [
                { idTenant: 1, codigo: 'ADMINISTRATIVO' },
                { idTenant: 1, codigo: 'OPERATIVO' },
                { idTenant: 1, codigo: 'OPERATIVO' },
            ],
            (fila) => `${fila.idTenant}|${fila.codigo}`,
            ['1|ADMINISTRATIVO'],
        );
        expect(nuevas).toEqual([{ idTenant: 1, codigo: 'OPERATIVO' }]);
    });

    it('reconoce el precio global aunque el DATETIME se lea en UTC o en hora local', () => {
        expect(clavePrecioGlobal(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
        expect(clavePrecioGlobal(new Date('2026-01-01T06:00:00.000Z'))).toBe('2026-01-01');
        expect(clavePrecioGlobal(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
        expect(clavePrecioGlobal(new Date('2026-02-01T00:00:00.000Z'))).toBe('2026-02-01');
    });

    it('deja en fase 2 solo muro y celebraciones, y el aviso operativo es el tipo corto', () => {
        expect(CAPACIDADES).toHaveLength(12);
        expect(CAPACIDADES.filter((fila) => fila.fase === 2).map((fila) => fila.codigo)).toEqual([
            ...CAPACIDADES_FASE_2,
        ]);
        expect(CAPACIDADES.filter((fila) => fila.fase === 1)).toHaveLength(8);

        const operativo = TIPOS_COMUNICADO.find((fila) => fila.codigo === 'AVISO_OPERATIVO');
        const reglas = TIPOS_COMUNICADO.find((fila) => fila.codigo === 'CAMBIO_REGLAS');
        const politica = TIPOS_COMUNICADO.find((fila) => fila.codigo === 'POLITICA');
        const plataforma = TIPOS_COMUNICADO.find((fila) => fila.codigo === 'USO_PLATAFORMA');
        expect(operativo).toMatchObject({ prioridadDefault: 'IMPORTANTE', acuseDefault: 'NINGUNO', esCorto: true });
        expect(reglas).toMatchObject({ prioridadDefault: 'CRITICA', acuseDefault: 'LEI_ENTENDI', modalDefault: true });
        expect(politica).toMatchObject({ prioridadDefault: 'IMPORTANTE', acuseDefault: 'LEI_ENTENDI', modalDefault: true });
        expect(plataforma).toMatchObject({ modalDefault: false, acuseDefault: 'NINGUNO' });
        expect(PRECIO_WA_GLOBAL).toMatchObject({ precioBase: '0.90', moneda: 'MXN', vigenteDesde: '2026-01-01' });
    });

    it('correr las semillas dos veces no duplica registros', async () => {
        const memoria = new MemoriaSemillas();
        memoria.tenants = [1, 2];
        memoria.tiposPersonal.push({ idTenant: 1, codigo: 'ADMINISTRATIVO', nombre: 'Administrativo' });
        memoria.canales.push({ code: 'PUSH', description: 'ya estaba' });

        const primera = await aplicarSemillas(memoria);
        const conteos = {
            personal: memoria.tiposPersonal.length,
            comunicados: memoria.tiposComunicado.length,
            capacidades: memoria.capacidades.length,
            canales: memoria.canales.length,
            tipos: memoria.tiposNotificacion.length,
            precios: memoria.precios.length,
        };

        expect(primera.insertados).toEqual({
            tiposPersonal: 5,
            tiposComunicado: 12,
            capacidades: 12,
            canales: 2,
            tiposNotificacion: 6,
            precios: 1,
        });
        expect(primera.total).toBe(38);
        expect(memoria.canales.map((fila) => fila.code)).toEqual(['PUSH', 'KIOSCO', 'WEB']);
        expect(memoria.precios).toEqual([PRECIO_WA_GLOBAL]);
        expect(memoria.tiposPersonal.filter((fila) => fila.codigo === 'ADMINISTRATIVO')).toHaveLength(2);

        const segunda = await aplicarSemillas(memoria);
        expect(segunda.total).toBe(0);
        expect(segunda.insertados).toEqual({
            tiposPersonal: 0,
            tiposComunicado: 0,
            capacidades: 0,
            canales: 0,
            tiposNotificacion: 0,
            precios: 0,
        });
        expect({
            personal: memoria.tiposPersonal.length,
            comunicados: memoria.tiposComunicado.length,
            capacidades: memoria.capacidades.length,
            canales: memoria.canales.length,
            tipos: memoria.tiposNotificacion.length,
            precios: memoria.precios.length,
        }).toEqual(conteos);
    });
});
