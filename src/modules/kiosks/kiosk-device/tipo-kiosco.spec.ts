import { botonSugeridoKiosco, mensajeRechazoKiosco, tipoRealKiosco } from './tipo-kiosco';

describe('tipoRealKiosco', () => {
    it.each([
        [null, 'ENTRADA', 'ENTRADA'],
        [null, 'SALIDA', 'SALIDA'],
        ['ENTRADA', 'ENTRADA', 'ENTRADA'],
        ['ENTRADA', 'SALIDA', 'SALIDA'],
        ['INICIO_COMIDA', 'ENTRADA', 'FIN_COMIDA'],
        ['INICIO_COMIDA', 'SALIDA', 'SALIDA'],
        ['FIN_COMIDA', 'ENTRADA', 'FIN_COMIDA'],
        ['FIN_COMIDA', 'SALIDA', 'SALIDA'],
        ['SALIDA', 'ENTRADA', 'ENTRADA'],
        ['SALIDA', 'SALIDA', 'SALIDA'],
    ] as const)('último %s y botón %s se registra como %s', (ultimo, boton, esperado) => {
        expect(tipoRealKiosco(boton, ultimo)).toBe(esperado);
    });
});

describe('botonSugeridoKiosco', () => {
    it.each([
        [null, 'ENTRADA'],
        ['ENTRADA', 'SALIDA'],
        ['INICIO_COMIDA', 'ENTRADA'],
        ['FIN_COMIDA', 'SALIDA'],
        ['SALIDA', null],
    ] as const)('último %s sugiere %s', (ultimo, esperado) => {
        expect(botonSugeridoKiosco(ultimo)).toBe(esperado);
    });
});

describe('mensajeRechazoKiosco', () => {
    const motivo = 'No puedes registrar SALIDA ahora. Las acciones permitidas son: FIN_COMIDA.';

    it('explica la salida con la comida abierta', () => {
        expect(mensajeRechazoKiosco('SALIDA', 'INICIO_COMIDA', 'TRANSICION_INVALIDA', motivo)).toBe(
            'Tienes abierta tu salida a comida. Primero marca Entrada para registrar tu regreso y después marca Salida.',
        );
    });

    it('pide la entrada cuando todavía no hay jornada', () => {
        expect(mensajeRechazoKiosco('SALIDA', null, 'TRANSICION_INVALIDA', motivo)).toBe(
            'Todavía no tienes entrada hoy. Marca Entrada primero.',
        );
    });

    it('explica la entrada repetida', () => {
        expect(mensajeRechazoKiosco('ENTRADA', 'ENTRADA', 'TRANSICION_INVALIDA', motivo)).toBe(
            'Ya registraste tu entrada de hoy. Si te vas, marca Salida.',
        );
    });

    it('explica el regreso de comida repetido', () => {
        expect(mensajeRechazoKiosco('ENTRADA', 'FIN_COMIDA', 'TRANSICION_INVALIDA', motivo)).toBe(
            'Ya registraste tu regreso de comida. Si te vas, marca Salida.',
        );
    });

    it('en otro código devuelve el motivo del motor', () => {
        const jornada = 'La jornada de hoy ya está cerrada. Pide a Recursos Humanos un registro manual.';
        expect(mensajeRechazoKiosco('ENTRADA', 'SALIDA', 'JORNADA_CERRADA', jornada)).toBe(jornada);
    });
});
