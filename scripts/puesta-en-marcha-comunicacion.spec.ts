import { CAPACIDADES_FASE_1 } from './puesta-en-marcha-comunicacion';
import {
    aplicarPuestaEnMarcha,
    AsignacionNueva,
    CapacidadCatalogo,
    codigoTipoDeClasificacion,
    PuestoClasificado,
    PuestaEnMarchaStore,
    RolSimple,
    TipoPersonalExistente,
} from './puesta-en-marcha-comunicacion';
import { TIPOS_COMUNICADO } from './seed-comunicacion-catalogos';

class MemoriaPuesta implements PuestaEnMarchaStore {
    tenants: number[] = [];
    personal: (TipoPersonalExistente & { idTenant: number; nombre: string })[] = [];
    comunicados: { idTenant: number; codigo: string }[] = [];
    empresas: { idTenant: number; idEmpresa: number }[] = [];
    configs: { idTenant: number; idEmpresa: number }[] = [];
    capacidades: CapacidadCatalogo[] = [];
    roles: (RolSimple & { idTenant: number })[] = [];
    asignaciones: AsignacionNueva[] = [];
    puestos: (PuestoClasificado & { idTenant: number })[] = [];
    private siguienteTipo = 1;

    listarTenants() {
        return Promise.resolve([...this.tenants]);
    }

    listarTiposPersonal(idTenant: number) {
        return Promise.resolve(
            this.personal.filter((fila) => fila.idTenant === idTenant).map((fila) => ({ id: fila.id, codigo: fila.codigo })),
        );
    }

    insertarTiposPersonal(idTenant: number, filas: { codigo: string; nombre: string }[]) {
        for (const fila of filas) {
            if (this.personal.some((existente) => existente.idTenant === idTenant && existente.codigo === fila.codigo)) {
                return Promise.reject(new Error(`Tipo de personal duplicado ${fila.codigo}`));
            }
            this.personal.push({ id: this.siguienteTipo, idTenant, codigo: fila.codigo, nombre: fila.nombre });
            this.siguienteTipo += 1;
        }
        return Promise.resolve();
    }

    listarCodigosComunicado(idTenant: number) {
        return Promise.resolve(this.comunicados.filter((fila) => fila.idTenant === idTenant).map((fila) => fila.codigo));
    }

    insertarTiposComunicado(filas: readonly { idTenant: number; codigo: string }[]) {
        for (const fila of filas) {
            if (this.comunicados.some((existente) => existente.idTenant === fila.idTenant && existente.codigo === fila.codigo)) {
                return Promise.reject(new Error(`Tipo de comunicado duplicado ${fila.codigo}`));
            }
            this.comunicados.push({ idTenant: fila.idTenant, codigo: fila.codigo });
        }
        return Promise.resolve();
    }

    listarEmpresas(idTenant: number) {
        return Promise.resolve(
            this.empresas.filter((fila) => fila.idTenant === idTenant).map((fila) => fila.idEmpresa).sort((a, b) => a - b),
        );
    }

    listarEmpresasConConfig(idEmpresas: readonly number[]) {
        const pedidos = new Set(idEmpresas);
        return Promise.resolve(this.configs.filter((fila) => pedidos.has(fila.idEmpresa)).map((fila) => fila.idEmpresa));
    }

    insertarConfigs(filas: { idTenant: number; idEmpresa: number }[]) {
        for (const fila of filas) {
            if (this.configs.some((existente) => existente.idEmpresa === fila.idEmpresa)) {
                return Promise.reject(new Error(`Config duplicada ${fila.idEmpresa}`));
            }
            this.configs.push({ ...fila });
        }
        return Promise.resolve();
    }

    listarCapacidades() {
        return Promise.resolve(this.capacidades.map((fila) => ({ ...fila })));
    }

    listarRoles(idTenant: number) {
        return Promise.resolve(
            this.roles.filter((rol) => rol.idTenant === idTenant).map((rol) => ({ idRol: rol.idRol, nombre: rol.nombre })),
        );
    }

    rolesConAlgunaCapacidad(idRoles: readonly number[]) {
        const pedidos = new Set(idRoles);
        return Promise.resolve([...new Set(this.asignaciones.filter((fila) => pedidos.has(fila.idRol)).map((fila) => fila.idRol))]);
    }

    insertarAsignaciones(filas: readonly AsignacionNueva[]) {
        for (const fila of filas) {
            if (this.asignaciones.some((existente) => existente.idRol === fila.idRol && existente.idCapacidad === fila.idCapacidad)) {
                return Promise.reject(new Error(`Capacidad duplicada ${fila.idRol}|${fila.idCapacidad}`));
            }
            this.asignaciones.push({ ...fila, referencias: fila.referencias ? [...fila.referencias] : null, tiposPermitidos: fila.tiposPermitidos ? [...fila.tiposPermitidos] : null });
        }
        return Promise.resolve();
    }

    listarPuestos(idTenant: number) {
        return Promise.resolve(
            this.puestos
                .filter((puesto) => puesto.idTenant === idTenant)
                .map((puesto) => ({
                    idPuesto: puesto.idPuesto,
                    idTipoPersonal: puesto.idTipoPersonal,
                    clasificacion: puesto.clasificacion,
                })),
        );
    }

    actualizarTipoPersonal(idPuestos: readonly number[], idTipoPersonal: number) {
        const pedidos = new Set(idPuestos);
        let cuenta = 0;
        for (const puesto of this.puestos) {
            if (!pedidos.has(puesto.idPuesto)) continue;
            puesto.idTipoPersonal = idTipoPersonal;
            cuenta += 1;
        }
        return Promise.resolve(cuenta);
    }
}

function capacidades(): CapacidadCatalogo[] {
    return CAPACIDADES_FASE_1.map((codigo, indice) => ({ id: indice + 1, codigo }));
}

describe('puesta en marcha de comunicación', () => {
    it('reconoce la clasificación del puesto por nombre, sin inventar las que no coinciden', () => {
        expect(codigoTipoDeClasificacion('Operativo')).toBe('OPERATIVO');
        expect(codigoTipoDeClasificacion(' gerencial ')).toBe('DIRECTIVO');
        expect(codigoTipoDeClasificacion('EJECUTIVO')).toBe('DIRECTIVO');
        expect(codigoTipoDeClasificacion('Administrativo')).toBe('ADMINISTRATIVO');
        expect(codigoTipoDeClasificacion('Supervisor')).toBeNull();
    });

    it('deja al Admin con la plantilla y la segunda corrida no duplica ni pisa lo ajustado', async () => {
        const memoria = new MemoriaPuesta();
        memoria.tenants = [7];
        memoria.empresas = [
            { idTenant: 7, idEmpresa: 20 },
            { idTenant: 7, idEmpresa: 10 },
        ];
        memoria.configs = [{ idTenant: 7, idEmpresa: 10 }];
        memoria.capacidades = capacidades();
        memoria.roles = [
            { idRol: 1, idTenant: 7, nombre: 'Admin' },
            { idRol: 2, idTenant: 7, nombre: 'RH' },
            { idRol: 3, idTenant: 7, nombre: 'Manager' },
            { idRol: 4, idTenant: 7, nombre: 'Empleado' },
            { idRol: 5, idTenant: 7, nombre: 'Supervisor' },
        ];
        memoria.asignaciones.push({
            idTenant: 7,
            idRol: 5,
            idCapacidad: 1,
            alcance: 'ESTRUCTURA',
            referencias: null,
            tiposPermitidos: ['AVISO_EQUIPO'],
        });
        memoria.personal.push({ id: 50, idTenant: 7, codigo: 'ADMINISTRATIVO', nombre: 'Administrativo a mano' });
        memoria.siguienteTipo = 51;
        memoria.puestos = [
            { idPuesto: 1, idTenant: 7, idTipoPersonal: 50, clasificacion: 'Operativo' },
            { idPuesto: 2, idTenant: 7, idTipoPersonal: 50, clasificacion: 'DIRECTIVO' },
            { idPuesto: 3, idTenant: 7, idTipoPersonal: 50, clasificacion: 'Administrativo' },
            { idPuesto: 4, idTenant: 7, idTipoPersonal: 50, clasificacion: 'Supervisor' },
            { idPuesto: 5, idTenant: 7, idTipoPersonal: 99, clasificacion: 'Operativo' },
            { idPuesto: 6, idTenant: 7, idTipoPersonal: 99, clasificacion: 'Administrativo' },
        ];

        const primera = await aplicarPuestaEnMarcha(memoria);
        expect(primera).toEqual([
            {
                idTenant: 7,
                tiposPersonalCreados: 2,
                tiposComunicadoCreados: TIPOS_COMUNICADO.length,
                configsCreadas: 1,
                rolesConPlantilla: 3,
                capacidadesAsignadas: CAPACIDADES_FASE_1.length * 2 + 3,
                puestosActualizados: 4,
                puestosSinMapear: 1,
                puestosSinMapearIds: [4],
            },
        ]);

        const admin = memoria.asignaciones.filter((fila) => fila.idRol === 1);
        expect(admin.map((fila) => memoria.capacidades.find((cap) => cap.id === fila.idCapacidad)?.codigo).sort()).toEqual(
            [...CAPACIDADES_FASE_1].sort(),
        );
        expect(admin.every((fila) => fila.alcance === 'EMPRESAS' && fila.referencias?.join(',') === '10,20')).toBe(true);
        expect(admin.some((fila) => memoria.capacidades.find((cap) => cap.id === fila.idCapacidad)?.codigo === 'CFG_PERMISOS')).toBe(true);

        const manager = memoria.asignaciones.filter((fila) => fila.idRol === 3);
        const crear = manager.find((fila) => memoria.capacidades.find((cap) => cap.id === fila.idCapacidad)?.codigo === 'COM_CREAR');
        expect(crear).toMatchObject({
            alcance: 'ESTRUCTURA',
            referencias: null,
            tiposPermitidos: ['GENERAL', 'AVISO_OPERATIVO', 'AVISO_EQUIPO'],
        });
        expect(manager.every((fila) => fila.alcance === 'ESTRUCTURA')).toBe(true);
        expect(memoria.asignaciones.some((fila) => fila.idRol === 4)).toBe(false);
        expect(memoria.asignaciones.filter((fila) => fila.idRol === 5)).toHaveLength(1);

        const idOperativo = memoria.personal.find((fila) => fila.codigo === 'OPERATIVO')?.id;
        const idDirectivo = memoria.personal.find((fila) => fila.codigo === 'DIRECTIVO')?.id;
        expect(memoria.puestos.find((puesto) => puesto.idPuesto === 1)?.idTipoPersonal).toBe(idOperativo);
        expect(memoria.puestos.find((puesto) => puesto.idPuesto === 2)?.idTipoPersonal).toBe(idDirectivo);
        expect(memoria.puestos.find((puesto) => puesto.idPuesto === 3)?.idTipoPersonal).toBe(50);
        expect(memoria.puestos.find((puesto) => puesto.idPuesto === 4)?.idTipoPersonal).toBe(50);
        expect(memoria.puestos.find((puesto) => puesto.idPuesto === 5)?.idTipoPersonal).toBe(idOperativo);
        expect(memoria.puestos.find((puesto) => puesto.idPuesto === 6)?.idTipoPersonal).toBe(50);
        expect(memoria.personal.find((fila) => fila.codigo === 'ADMINISTRATIVO')?.nombre).toBe('Administrativo a mano');
        expect(memoria.configs).toEqual([
            { idTenant: 7, idEmpresa: 10 },
            { idTenant: 7, idEmpresa: 20 },
        ]);

        const segunda = await aplicarPuestaEnMarcha(memoria);
        expect(segunda).toEqual([
            {
                idTenant: 7,
                tiposPersonalCreados: 0,
                tiposComunicadoCreados: 0,
                configsCreadas: 0,
                rolesConPlantilla: 0,
                capacidadesAsignadas: 0,
                puestosActualizados: 0,
                puestosSinMapear: 1,
                puestosSinMapearIds: [4],
            },
        ]);
        expect(memoria.asignaciones.filter((fila) => fila.idRol === 1)).toHaveLength(CAPACIDADES_FASE_1.length);
        expect(memoria.comunicados).toHaveLength(TIPOS_COMUNICADO.length);
    });
});
