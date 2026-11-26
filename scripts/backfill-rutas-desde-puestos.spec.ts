import {
    aplicarBackfill,
    BackfillRutasStore,
    CaminoPuesto,
    CursoPuesto,
    PuestoOrigen,
    RutaGuardada,
    RutaPlan,
} from './backfill-rutas-desde-puestos';

class MemoriaRutas implements BackfillRutasStore {
    puestos: PuestoOrigen[] = [];
    cursos: CursoPuesto[] = [];
    rutas: Array<RutaGuardada & { etapas: RutaPlan['etapas'] }> = [];
    caminos: CaminoPuesto[] = [];
    asignaciones = 0;
    private siguiente = 1;

    listarPuestosConCursosActivos() {
        const conCurso = new Set(
            this.cursos.filter((curso) => curso.activo !== false).map((curso) => curso.idPuesto),
        );
        return Promise.resolve(this.puestos.filter((puesto) => conCurso.has(puesto.idPuesto)).map((puesto) => ({ ...puesto })));
    }

    listarCursosActivos(idPuestos: readonly number[]) {
        const pedidos = new Set(idPuestos);
        return Promise.resolve(
            this.cursos
                .filter((curso) => pedidos.has(curso.idPuesto) && curso.activo !== false)
                .map((curso) => ({ ...curso })),
        );
    }

    listarRutas(idEmpresa: number) {
        return Promise.resolve(
            this.rutas
                .filter((ruta) => ruta.idEmpresa === idEmpresa)
                .map((ruta) => ({
                    idRutaAprendizaje: ruta.idRutaAprendizaje,
                    idEmpresa: ruta.idEmpresa,
                    nombre: ruta.nombre,
                    proposito: ruta.proposito,
                    idPuesto: ruta.idPuesto,
                })),
        );
    }

    listarCaminos(idEmpresa: number, idPuestoDestino: number) {
        return Promise.resolve(
            this.caminos
                .filter((camino) => camino.idEmpresa === idEmpresa && camino.idPuestoDestino === idPuestoDestino)
                .map((camino) => ({ ...camino })),
        );
    }

    crearRuta(plan: RutaPlan) {
        const guardada = {
            idRutaAprendizaje: this.siguiente,
            idEmpresa: plan.idEmpresa,
            nombre: plan.nombre,
            proposito: plan.proposito,
            idPuesto: plan.idPuesto,
            etapas: plan.etapas.map((etapa) => ({ ...etapa, elementos: etapa.elementos.map((elemento) => ({ ...elemento })) })),
        };
        this.siguiente += 1;
        this.rutas.push(guardada);
        return Promise.resolve({
            idRutaAprendizaje: guardada.idRutaAprendizaje,
            idEmpresa: guardada.idEmpresa,
            nombre: guardada.nombre,
            proposito: guardada.proposito,
            idPuesto: guardada.idPuesto,
        });
    }

    enlazarCamino(idRuta: number, idRutaAprendizaje: number) {
        const camino = this.caminos.find((fila) => fila.idRuta === idRuta);
        if (!camino) return Promise.reject(new Error(`Camino ${idRuta} inexistente`));
        if (camino.idRutaAprendizaje != null) {
            return Promise.reject(new Error(`Camino ${idRuta} ya enlazado`));
        }
        camino.idRutaAprendizaje = idRutaAprendizaje;
        return Promise.resolve();
    }
}

function cursosDe(idPuesto: number, base: number): CursoPuesto[] {
    return [1, 2, 3, 4].map((tipo) => ({
        idPuesto,
        idCurso: base + tipo,
        idTipoCurso: tipo,
        activo: true,
    }));
}

describe('backfill de rutas desde puestos', () => {
    function memoriaBase() {
        const memoria = new MemoriaRutas();
        memoria.puestos = [
            { idPuesto: 10, idEmpresa: 1, idTenant: 7, nombre: 'Analista' },
            { idPuesto: 20, idEmpresa: 1, idTenant: 7, nombre: 'Supervisor' },
        ];
        memoria.cursos = [...cursosDe(10, 100), ...cursosDe(20, 200)];
        memoria.caminos = [
            { idRuta: 1, idEmpresa: 1, idPuestoDestino: 10, idRutaAprendizaje: null },
            { idRuta: 2, idEmpresa: 1, idPuestoDestino: 20, idRutaAprendizaje: null },
        ];
        return memoria;
    }

    it('crea dos rutas de puesto y dos de promoción, con las etapas de cada tipo', async () => {
        const memoria = memoriaBase();
        const resumen = await aplicarBackfill(memoria);

        expect(resumen).toEqual({
            rutasPuestoCreadas: 2,
            rutasPromocionCreadas: 2,
            rutasOmitidas: 0,
            caminosEnlazados: 2,
        });
        expect(memoria.asignaciones).toBe(0);
        expect(memoria.cursos).toHaveLength(8);

        const analista = memoria.rutas.find((ruta) => ruta.nombre === 'Analista' && ruta.proposito === 'puesto');
        const promocion = memoria.rutas.find((ruta) => ruta.nombre === 'Promoción a Analista');
        expect(analista?.idPuesto).toBe(10);
        expect(analista?.etapas.map((etapa) => etapa.nombre)).toEqual(['Ingreso', 'Puesto']);
        expect(analista?.etapas[0]).toMatchObject({ diaInicio: 0, diaFin: 30, requiereEtapaAnterior: false });
        expect(analista?.etapas[0].elementos.map((elemento) => elemento.idCurso)).toEqual([101]);
        expect(analista?.etapas[1]).toMatchObject({ diaInicio: 0, diaFin: 90, requiereEtapaAnterior: true });
        expect(analista?.etapas[1].elementos).toEqual([
            { idCurso: 102, orden: 1, obligatorio: true },
            { idCurso: 104, orden: 2, obligatorio: true },
        ]);
        expect(promocion?.etapas).toHaveLength(1);
        expect(promocion?.etapas[0].elementos.map((elemento) => elemento.idCurso)).toEqual([103]);
        expect(promocion?.proposito).toBe('promocion');

        const supervisor = memoria.rutas.find((ruta) => ruta.nombre === 'Supervisor');
        expect(supervisor?.etapas[0].elementos.map((elemento) => elemento.idCurso)).toEqual([201]);
        expect(supervisor?.etapas[1].elementos.map((elemento) => elemento.idCurso)).toEqual([202, 204]);
        expect(memoria.caminos.map((camino) => camino.idRutaAprendizaje)).toEqual([
            promocion?.idRutaAprendizaje,
            memoria.rutas.find((ruta) => ruta.nombre === 'Promoción a Supervisor')?.idRutaAprendizaje,
        ]);
    });

    it('la segunda corrida no duplica rutas ni vuelve a enlazar caminos', async () => {
        const memoria = memoriaBase();
        await aplicarBackfill(memoria);
        const segunda = await aplicarBackfill(memoria);

        expect(segunda).toEqual({
            rutasPuestoCreadas: 0,
            rutasPromocionCreadas: 0,
            rutasOmitidas: 4,
            caminosEnlazados: 0,
        });
        expect(memoria.rutas).toHaveLength(4);
    });

    it('no repite un curso en la versión de puesto cuando viene como tipo 2 y tipo 4', async () => {
        const memoria = memoriaBase();
        memoria.cursos.push({ idPuesto: 10, idCurso: 102, idTipoCurso: 4, activo: true });
        await aplicarBackfill(memoria);
        const puesto = memoria.rutas.find((ruta) => ruta.nombre === 'Analista' && ruta.proposito === 'puesto');
        const cursos = puesto?.etapas.flatMap((etapa) => etapa.elementos.map((elemento) => elemento.idCurso));
        expect(cursos).toEqual([101, 102, 104]);
        expect(puesto?.etapas[1].elementos.find((elemento) => elemento.idCurso === 102)?.obligatorio).toBe(true);
    });
});
