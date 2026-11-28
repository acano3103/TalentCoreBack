import {
    CaminoFila,
    CaminosCarreraStore,
    PuestoNivel,
    revisarCaminos,
} from './revisar-caminos-carrera';

class Memoria implements CaminosCarreraStore {
    caminos: CaminoFila[] = [];
    puestos: PuestoNivel[] = [];
    empresas: { idEmpresa: number; nombre: string }[] = [];
    planes = new Map<number, number>();
    laterales: number[] = [];
    desactivados: number[] = [];

    listarCaminosActivos() {
        return Promise.resolve(this.caminos.map((camino) => ({ ...camino })));
    }

    listarPuestos() {
        return Promise.resolve(this.puestos.map((puesto) => ({ ...puesto })));
    }

    listarEmpresas() {
        return Promise.resolve(this.empresas.map((empresa) => ({ ...empresa })));
    }

    contarPlanesActivos() {
        return Promise.resolve(new Map(this.planes));
    }

    marcarLateral(idRuta: number) {
        this.laterales.push(idRuta);
        const camino = this.caminos.find((fila) => fila.idRuta === idRuta);
        if (camino) camino.tipo = 'lateral';
        return Promise.resolve();
    }

    desactivar(idRuta: number) {
        this.desactivados.push(idRuta);
        this.caminos = this.caminos.filter((fila) => fila.idRuta !== idRuta);
        return Promise.resolve();
    }
}

function memoriaConLosTres(): Memoria {
    const memoria = new Memoria();
    memoria.empresas = [{ idEmpresa: 1, nombre: 'Data Voice' }];
    memoria.puestos = [
        { idPuesto: 41, nombre: 'Product Owner', nivel: 3 },
        { idPuesto: 40, nombre: 'Desarrollador Full Stack Senior', nivel: 2 },
        { idPuesto: 50, nombre: 'Director General', nivel: 5 },
        { idPuesto: 51, nombre: 'Líder Técnico de Desarrollo', nivel: 3 },
        { idPuesto: 52, nombre: 'Diseñador UI/UX Senior', nivel: 2 },
        { idPuesto: 60, nombre: 'Gerente de Desarrollo de Software', nivel: 4 },
    ];
    memoria.caminos = [
        { idRuta: 1, idEmpresa: 1, idPuestoOrigen: 41, idPuestoDestino: 40, tipo: 'ascenso' },
        { idRuta: 2, idEmpresa: 1, idPuestoOrigen: 50, idPuestoDestino: 51, tipo: 'ascenso' },
        { idRuta: 3, idEmpresa: 1, idPuestoOrigen: 52, idPuestoDestino: 40, tipo: 'ascenso' },
        { idRuta: 4, idEmpresa: 1, idPuestoOrigen: 51, idPuestoDestino: 60, tipo: 'ascenso' },
    ];
    memoria.planes.set(2, 1);
    return memoria;
}

describe('revisar caminos de carrera', () => {
    it('lista los tres caminos viejos y no escribe sin bandera', async () => {
        const memoria = memoriaConLosTres();

        const texto = await revisarCaminos(memoria, {
            corregirTipo: false,
            desactivarMenores: false,
        });

        expect(texto).toContain('Empresa Data Voice (1)');
        expect(texto).toContain(
            'Product Owner → Desarrollador Full Stack Senior | niveles 3 → 2 | guardado ascenso | real menor | planes activos: 0',
        );
        expect(texto).toContain(
            'Director General → Líder Técnico de Desarrollo | niveles 5 → 3 | guardado ascenso | real menor | planes activos: 1',
        );
        expect(texto).toContain(
            'Diseñador UI/UX Senior → Desarrollador Full Stack Senior | niveles 2 → 2 | guardado ascenso | real lateral | planes activos: 0',
        );
        expect(texto).not.toContain('Gerente de Desarrollo de Software');
        expect(texto).toContain('--corregir-tipo actualizaría 1 camino(s) a lateral.');
        expect(texto).toContain('--desactivar-menores desactivaría 1 camino(s) menor sin planes activos.');
        expect(texto).toContain('Sin banderas no se escribió nada.');
        expect(memoria.laterales).toEqual([]);
        expect(memoria.desactivados).toEqual([]);
    });

    it('corrige el lateral y solo desactiva menores sin planes activos', async () => {
        const memoria = memoriaConLosTres();

        const texto = await revisarCaminos(memoria, {
            corregirTipo: true,
            desactivarMenores: true,
        });

        expect(memoria.laterales).toEqual([3]);
        expect(memoria.desactivados).toEqual([1]);
        expect(memoria.caminos.map((camino) => camino.idRuta)).toEqual([2, 3, 4]);
        expect(memoria.caminos.find((camino) => camino.idRuta === 3)?.tipo).toBe('lateral');
        expect(texto).toContain('Aplicado.');
        expect(texto).toContain(
            'Data Voice: Director General → Líder Técnico de Desarrollo | planes activos: 1',
        );
    });
});
