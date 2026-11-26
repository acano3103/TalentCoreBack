import { PERMISSION_BLUEPRINTS, codigoModuloCanonico } from '../src/modules/super-admin/tenants/blueprints/tenant-blueprints';
import {
    aplicarBackfillRutas,
    BackfillRutasStore,
    CODIGOS_RUTAS,
    MODULOS_RUTAS,
    ModuloNuevo,
    ModuloRuta,
    PERMISOS_RUTAS,
    PermisoNuevo,
    RolTenant,
} from './backfill-rutas-modulos';

interface PermisoGuardado extends PermisoNuevo {
    activo: boolean;
}

class MemoriaBackfill implements BackfillRutasStore {
    tenants: number[] = [];
    modulos: ModuloRuta[] = [];
    roles: RolTenant[] = [];
    permisos: PermisoGuardado[] = [];
    private siguienteId = 1;

    listarTenants() {
        return Promise.resolve([...this.tenants]);
    }

    listarModulos(idTenant: number, codigos: readonly string[]) {
        const pedidos = new Set(codigos);
        return Promise.resolve(
            this.modulos
                .filter((modulo) => modulo.idTenant === idTenant && pedidos.has(modulo.codigo))
                .map((modulo) => ({ ...modulo })),
        );
    }

    insertarModulo(modulo: ModuloNuevo) {
        const creado: ModuloRuta = {
            idModulo: this.siguienteId,
            idTenant: modulo.idTenant,
            codigo: modulo.codigo,
            descripcion: modulo.descripcion,
            idPadre: modulo.idPadre,
        };
        this.siguienteId += 1;
        this.modulos.push(creado);
        return Promise.resolve({ ...creado });
    }

    listarRoles(idTenant: number) {
        return Promise.resolve(this.roles.filter((rol) => rol.idTenant === idTenant).map((rol) => ({ ...rol })));
    }

    listarPermisos(idRoles: readonly number[], idModulos: readonly number[]) {
        const roles = new Set(idRoles);
        const modulos = new Set(idModulos);
        return Promise.resolve(
            this.permisos
                .filter((permiso) => roles.has(permiso.idRol) && modulos.has(permiso.idModulo))
                .map((permiso) => ({ idRol: permiso.idRol, idModulo: permiso.idModulo })),
        );
    }

    insertarPermisos(permisos: readonly PermisoNuevo[]) {
        for (const permiso of permisos) {
            const repetido = this.permisos.some(
                (existente) => existente.idRol === permiso.idRol && existente.idModulo === permiso.idModulo,
            );
            if (repetido) {
                return Promise.reject(new Error(`Permiso duplicado ${permiso.idRol}|${permiso.idModulo}`));
            }
            this.permisos.push({ ...permiso, activo: true });
        }
        return Promise.resolve();
    }
}

describe('backfill de módulos de rutas', () => {
    const codigos = [...CODIGOS_RUTAS];

    function preparar() {
        const memoria = new MemoriaBackfill();
        memoria.tenants = [1, 2];
        memoria.roles = [
            { idRol: 10, idTenant: 1, nombre: 'Admin' },
            { idRol: 11, idTenant: 1, nombre: 'Empleado' },
            { idRol: 12, idTenant: 1, nombre: 'Supervisor' },
            { idRol: 20, idTenant: 2, nombre: 'Admin' },
            { idRol: 21, idTenant: 2, nombre: 'Empleado' },
        ];
        memoria.modulos.push(
            { idModulo: 800, idTenant: 1, codigo: 'training', descripcion: 'Capacitación', idPadre: null },
            { idModulo: 801, idTenant: 1, codigo: 'configuration', descripcion: 'Configuración', idPadre: null },
            { idModulo: 802, idTenant: 2, codigo: 'training', descripcion: 'Capacitación', idPadre: null },
            { idModulo: 803, idTenant: 2, codigo: 'configuration', descripcion: 'Configuración', idPadre: null },
            { idModulo: 900, idTenant: 1, codigo: 'employees', descripcion: 'Empleados', idPadre: 700 },
        );
        memoria.permisos.push({
            idTenant: 1,
            idRol: 10,
            idModulo: 900,
            puedeVer: true,
            puedeCrear: true,
            puedeActualizar: false,
            puedeEliminar: false,
            activo: true,
        });
        return memoria;
    }

    it('reutiliza los módulos nuevos y sus permisos del blueprint', () => {
        expect(MODULOS_RUTAS.map((modulo) => modulo.codigo)).toEqual(codigos);
        expect(PERMISOS_RUTAS.map((permiso) => permiso.moduloCodigo)).toEqual(
            ['Admin', 'RH', 'Finanzas', 'Reclutador', 'Manager', 'Empleado'].flatMap(() => codigos),
        );
        expect(codigoModuloCanonico('career-plan-config')).toBe('training-config');
        expect(PERMISOS_RUTAS.find((permiso) => permiso.rolName === 'Manager' && permiso.moduloCodigo === 'learning-paths')).toMatchObject({
            puedeVer: true,
            puedeCrear: false,
            puedeActualizar: false,
            puedeEliminar: false,
        });
        expect(PERMISOS_RUTAS.find((permiso) => permiso.rolName === 'RH' && permiso.moduloCodigo === 'training-config')?.puedeEliminar).toBe(
            false,
        );
        expect(PERMISOS_RUTAS.find((permiso) => permiso.rolName === 'Empleado' && permiso.moduloCodigo === 'learning-paths')).toMatchObject({
            puedeVer: false,
            puedeCrear: false,
            puedeActualizar: false,
            puedeEliminar: false,
        });
    });

    it('crea el menú una vez y la segunda corrida no duplica ni pisa otros módulos', async () => {
        const memoria = preparar();
        const permisoEmpleados = memoria.permisos[0];

        const primera = await aplicarBackfillRutas(memoria);
        expect(primera).toEqual([
            { idTenant: 1, modulosCreados: 4, permisosCreados: 8 },
            { idTenant: 2, modulosCreados: 4, permisosCreados: 8 },
        ]);

        const modulosTenant1 = memoria.modulos.filter((modulo) => modulo.idTenant === 1 && codigos.includes(modulo.codigo));
        expect(modulosTenant1.map((modulo) => modulo.codigo)).toEqual(codigos);
        expect(modulosTenant1.find((modulo) => modulo.codigo === 'learning-paths')).toMatchObject({
            descripcion: 'Rutas de aprendizaje',
            idPadre: 800,
        });
        expect(modulosTenant1.find((modulo) => modulo.codigo === 'training-pending')?.idPadre).toBe(800);
        expect(modulosTenant1.find((modulo) => modulo.codigo === 'training-compliance')?.idPadre).toBe(800);
        expect(modulosTenant1.find((modulo) => modulo.codigo === 'training-config')).toMatchObject({
            descripcion: 'Capacitación',
            idPadre: 801,
        });
        expect(memoria.modulos.some((modulo) => modulo.codigo === 'job-courses' || modulo.codigo === 'career-plan-config')).toBe(
            false,
        );

        for (const rol of ['Admin', 'Empleado'] as const) {
            const idRol = memoria.roles.find((fila) => fila.idTenant === 1 && fila.nombre === rol)?.idRol;
            for (const plantilla of PERMISSION_BLUEPRINTS.filter(
                (permiso) => permiso.rolName === rol && codigos.includes(permiso.moduloCodigo),
            )) {
                const idModulo = modulosTenant1.find((modulo) => modulo.codigo === plantilla.moduloCodigo)?.idModulo;
                expect(memoria.permisos.find((permiso) => permiso.idRol === idRol && permiso.idModulo === idModulo)).toMatchObject({
                    puedeVer: plantilla.puedeVer,
                    puedeCrear: plantilla.puedeCrear,
                    puedeActualizar: plantilla.puedeActualizar,
                    puedeEliminar: plantilla.puedeEliminar,
                });
            }
        }

        const idRutas = modulosTenant1.find((modulo) => modulo.codigo === 'learning-paths')?.idModulo;
        expect(memoria.permisos.some((permiso) => permiso.idRol === 12 && permiso.idModulo === idRutas)).toBe(false);
        expect(permisoEmpleados).toEqual({
            idTenant: 1,
            idRol: 10,
            idModulo: 900,
            puedeVer: true,
            puedeCrear: true,
            puedeActualizar: false,
            puedeEliminar: false,
            activo: true,
        });

        const conteos = { modulos: memoria.modulos.length, permisos: memoria.permisos.length };
        const segunda = await aplicarBackfillRutas(memoria);
        expect(segunda).toEqual([
            { idTenant: 1, modulosCreados: 0, permisosCreados: 0 },
            { idTenant: 2, modulosCreados: 0, permisosCreados: 0 },
        ]);
        expect({ modulos: memoria.modulos.length, permisos: memoria.permisos.length }).toEqual(conteos);
    });

    it('conserva un permiso ya ajustado y completa solo los módulos que faltan', async () => {
        const memoria = new MemoriaBackfill();
        memoria.tenants = [4];
        memoria.roles = [
            { idRol: 40, idTenant: 4, nombre: 'Admin' },
            { idRol: 41, idTenant: 4, nombre: 'Auxiliar' },
        ];
        memoria.modulos.push(
            { idModulo: 70, idTenant: 4, codigo: 'training', descripcion: 'Capacitación', idPadre: null },
            { idModulo: 71, idTenant: 4, codigo: 'configuration', descripcion: 'Configuración', idPadre: null },
            { idModulo: 72, idTenant: 4, codigo: 'learning-paths', descripcion: 'Rutas de aprendizaje', idPadre: 70 },
        );
        memoria.permisos.push({
            idTenant: 4,
            idRol: 40,
            idModulo: 72,
            puedeVer: true,
            puedeCrear: false,
            puedeActualizar: false,
            puedeEliminar: false,
            activo: true,
        });
        const resumen = await aplicarBackfillRutas(memoria);
        expect(resumen).toEqual([{ idTenant: 4, modulosCreados: 3, permisosCreados: 3 }]);

        const hijosNuevos = memoria.modulos.filter(
            (modulo) => modulo.idTenant === 4 && modulo.codigo !== 'training' && modulo.codigo !== 'configuration' && modulo.codigo !== 'learning-paths',
        );
        expect(hijosNuevos.map((modulo) => modulo.codigo)).toEqual(['training-pending', 'training-compliance', 'training-config']);
        expect(hijosNuevos.filter((modulo) => modulo.codigo !== 'training-config').every((modulo) => modulo.idPadre === 70)).toBe(true);
        expect(hijosNuevos.find((modulo) => modulo.codigo === 'training-config')?.idPadre).toBe(71);
        expect(memoria.permisos.find((permiso) => permiso.idRol === 40 && permiso.idModulo === 72)).toMatchObject({
            puedeVer: true,
            puedeCrear: false,
            puedeActualizar: false,
            puedeEliminar: false,
        });
        expect(memoria.permisos.some((permiso) => permiso.idRol === 41)).toBe(false);

        const otra = await aplicarBackfillRutas(memoria);
        expect(otra).toEqual([{ idTenant: 4, modulosCreados: 0, permisosCreados: 0 }]);
        expect(memoria.permisos.find((permiso) => permiso.idRol === 40 && permiso.idModulo === 72)?.puedeCrear).toBe(false);
    });

    it('crea el padre de capacitación si el tenant no lo tiene', async () => {
        const memoria = new MemoriaBackfill();
        memoria.tenants = [5];
        memoria.roles = [{ idRol: 50, idTenant: 5, nombre: 'Admin' }];
        memoria.modulos.push({
            idModulo: 90,
            idTenant: 5,
            codigo: 'configuration',
            descripcion: 'Configuración',
            idPadre: null,
        });

        const resumen = await aplicarBackfillRutas(memoria);
        expect(resumen).toEqual([{ idTenant: 5, modulosCreados: 5, permisosCreados: 5 }]);

        const training = memoria.modulos.find((modulo) => modulo.codigo === 'training');
        expect(training).toMatchObject({ descripcion: 'Capacitación', idPadre: null });
        expect(memoria.modulos.find((modulo) => modulo.codigo === 'learning-paths')?.idPadre).toBe(training?.idModulo);
        expect(memoria.permisos.find((permiso) => permiso.idRol === 50 && permiso.idModulo === training?.idModulo)).toMatchObject({
            puedeVer: true,
            puedeCrear: true,
            puedeActualizar: true,
            puedeEliminar: true,
        });

        const otra = await aplicarBackfillRutas(memoria);
        expect(otra).toEqual([{ idTenant: 5, modulosCreados: 0, permisosCreados: 0 }]);
    });
});
