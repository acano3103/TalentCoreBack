import { precioVigente } from '../delivery/precio-wa';
import {
    debeAvisar80,
    diaEnMexico,
    marcarEstados,
    mesActual,
    rangoMes,
    resumirConsumo,
    vigenciaPermitida,
    evaluarTope,
} from './periodo';

describe('periodo y precios de WhatsApp', () => {
    const ahora = new Date('2026-11-14T18:00:00.000Z');
    const globalEnero = {
        id: 1,
        idTenant: null,
        precioBase: 0.4,
        preciosCategoria: null,
        moneda: 'MXN',
        vigenteDesde: new Date('2026-01-01T06:00:00.000Z'),
    };
    const tenantEnero = {
        id: 2,
        idTenant: 3,
        precioBase: 0.8,
        preciosCategoria: null,
        moneda: 'MXN',
        vigenteDesde: new Date('2026-01-01T06:00:00.000Z'),
    };
    const tenantProgramado = {
        id: 3,
        idTenant: 3,
        precioBase: 1.5,
        preciosCategoria: null,
        moneda: 'MXN',
        vigenteDesde: new Date('2026-12-01T06:00:00.000Z'),
    };

    it('marca vigente, programado e histórico sin usar la versión futura', () => {
        const estados = marcarEstados([globalEnero, tenantEnero, tenantProgramado], ahora);
        expect(estados.find((fila) => fila.id === 2)?.estado).toBe('VIGENTE');
        expect(estados.find((fila) => fila.id === 3)?.estado).toBe('PROGRAMADO');
        expect(estados.find((fila) => fila.id === 1)?.estado).toBe('VIGENTE');

        const precio = precioVigente([globalEnero, tenantEnero, tenantProgramado], 3, ahora, 'NORMAL');
        expect(precio).toEqual({ precio: 0.8, moneda: 'MXN' });

        const despues = marcarEstados([globalEnero, tenantEnero, tenantProgramado], new Date('2026-12-02T18:00:00.000Z'));
        expect(despues.find((fila) => fila.id === 3)?.estado).toBe('VIGENTE');
        expect(despues.find((fila) => fila.id === 2)?.estado).toBe('HISTORICO');
        expect(precioVigente([globalEnero, tenantEnero, tenantProgramado], 3, new Date('2026-12-02T18:00:00.000Z'), 'NORMAL')?.precio).toBe(
            1.5,
        );
    });

    it('no deja programar un precio en un día ya pasado en México', () => {
        expect(vigenciaPermitida(new Date('2026-11-14T12:00:00.000Z'), ahora)).toBe(true);
        expect(vigenciaPermitida(new Date('2026-11-13T12:00:00.000Z'), ahora)).toBe(false);
        expect(diaEnMexico(ahora)).toBe('2026-11-14');
    });

    it('un tenant no suma el consumo de otro', () => {
        const resumen = resumirConsumo(
            [
                { idTenant: 3, idEmpresa: 10, categoria: 'NORMAL', mensajes: 2, costo: 1.6 },
                { idTenant: 9, idEmpresa: 20, categoria: 'NORMAL', mensajes: 40, costo: 999 },
            ],
            3,
        );
        expect(resumen).toEqual({
            mensajes: 2,
            costo: 1.6,
            porCategoria: [{ categoria: 'NORMAL', mensajes: 2, costo: 1.6 }],
        });
        expect(JSON.stringify(resumen)).not.toContain('999');
    });

    it('avisa al 80 % una sola vez en el mes y la crítica no se bloquea', () => {
        expect(debeAvisar80(79.99, 100, null, '2026-11')).toBe(false);
        expect(debeAvisar80(80, 100, null, '2026-11')).toBe(true);
        expect(debeAvisar80(90, 100, '2026-11', '2026-11')).toBe(false);
        expect(debeAvisar80(90, 100, '2026-11', '2026-12')).toBe(true);

        const critico = evaluarTope({ consumo: 100, tope: 100, accion: 'BLOQUEAR', prioridad: 'CRITICA' });
        expect(critico?.bloqueaEnvio).toBe(false);
        expect(critico?.estado).toBe('AL_TOPE');
        expect(evaluarTope({ consumo: 100, tope: 100, accion: 'BLOQUEAR', prioridad: 'NORMAL' })?.bloqueaEnvio).toBe(true);
    });

    it('el mes UTC abre el día 1 y cierra al empezar el siguiente', () => {
        expect(mesActual(ahora)).toBe('2026-11');
        expect(rangoMes('2026-11')).toEqual({
            inicio: new Date('2026-11-01T00:00:00.000Z'),
            fin: new Date('2026-12-01T00:00:00.000Z'),
        });
    });
});
