import { PERMISSION_BLUEPRINTS } from '../src/modules/super-admin/tenants/blueprints/tenant-blueprints';
import {
    aplicarBackfillModulos,
    BackfillModulosStore,
    ModuloComunicacion,
    ModuloNuevo,
    PERMISOS_COMUNICACION,
    PermisoNuevo,
    RolTenant,
} from './backfill-comunicacion-modulos';

interface PermisoGuardado extends PermisoNuevo {
    activo: boolean;
}

class MemoriaBackfill implements BackfillModulosStore {
    tenants: number[] = [];
    modulos: ModuloComunicacion[] = [];
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
        const creado: ModuloComunicacion = {
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

/** Misma regla que AuthDataService.getStaffData: padre con lectura y al menos un hijo visible. */
function menuLogin(memoria: MemoriaBackfill, idRol: number) {
    const filas = memoria.permisos
        .filter((permiso) => permiso.idRol === idRol && permiso.activo)
        .map((permiso) => ({
            permiso,
            modulo: memoria.modulos.find((modulo) => modulo.idModulo === permiso.idModulo),
        }))
        .filter((fila) => fila.modulo);

    const padres = filas.filter((fila) => fila.modulo?.idPadre == null && fila.permiso.puedeVer);
    const hijos = filas.filter((fila) => fila.modulo?.idPadre != null && fila.permiso.puedeVer);

    return padres
        .map((padre) => ({
            code: padre.modulo?.codigo,
            name: padre.modulo?.descripcion,
            submodules: hijos
                .filter((hijo) => hijo.modulo?.idPadre === padre.permiso.idModulo)
                .map((hijo) => ({
                    code: hijo.modulo?.codigo,
                    permissions: {
                        read: hijo.permiso.puedeVer,
                        create: hijo.permiso.puedeCrear,
                        update: hijo.permiso.puedeActualizar,
                        delete: hijo.permiso.puedeEliminar,
                    },
                })),
        }))
        .filter((padre) => padre.submodules.length > 0);
}

describe('backfill de módulos de comunicación', () => {
    const codigos = [
        'internal-comms',
        'comms-my',
        'comms-announcements',
        'comms-audiences',
        'comms-reminders',
        'comms-channels',
    ];

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
        memoria.modulos.push({
            idModulo: 900,
            idTenant: 1,
            codigo: 'employees',
            descripcion: 'Empleados',
            idPadre: 800,
        });
        return memoria;
    }

    it('reutiliza los seis módulos y sus permisos del blueprint', () => {
        expect(PERMISOS_COMUNICACION.map((permiso) => permiso.moduloCodigo)).toEqual(
            ['Admin', 'RH', 'Finanzas', 'Reclutador', 'Manager', 'Empleado'].flatMap(() => codigos),
        );
        expect(new Set(PERMISOS_COMUNICACION.map((permiso) => permiso.rolName))).toEqual(
            new Set(['Admin', 'RH', 'Finanzas', 'Reclutador', 'Manager', 'Empleado']),
        );
    });

    it('crea el menú una vez y la segunda corrida no duplica ni pisa otros módulos', async () => {
        const memoria = preparar();
        const permisoEmpleados = memoria.permisos[0];

        const primera = await aplicarBackfillModulos(memoria);
        expect(primera).toEqual([
            { idTenant: 1, modulosCreados: 6, permisosCreados: 14 },
            { idTenant: 2, modulosCreados: 6, permisosCreados: 12 },
        ]);

        const modulosTenant1 = memoria.modulos.filter((modulo) => modulo.idTenant === 1 && codigos.includes(modulo.codigo));
        const padre = modulosTenant1.find((modulo) => modulo.codigo === 'internal-comms');
        expect(padre).toMatchObject({ descripcion: 'Comunicación interna', idPadre: null });
        expect(modulosTenant1.filter((modulo) => modulo.codigo !== 'internal-comms').map((modulo) => modulo.idPadre)).toEqual(
            [padre?.idModulo, padre?.idModulo, padre?.idModulo, padre?.idModulo, padre?.idModulo],
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

        const idCommsMy = modulosTenant1.find((modulo) => modulo.codigo === 'comms-my')?.idModulo;
        const idAnuncios = modulosTenant1.find((modulo) => modulo.codigo === 'comms-announcements')?.idModulo;
        expect(memoria.permisos.find((permiso) => permiso.idRol === 12 && permiso.idModulo === idCommsMy)).toMatchObject({
            puedeVer: true,
            puedeCrear: false,
            puedeActualizar: false,
            puedeEliminar: false,
        });
        expect(memoria.permisos.some((permiso) => permiso.idRol === 12 && permiso.idModulo === idAnuncios)).toBe(false);
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

        const menuAdmin = menuLogin(memoria, 10).find((modulo) => modulo.code === 'internal-comms');
        const menuEmpleado = menuLogin(memoria, 11).find((modulo) => modulo.code === 'internal-comms');
        expect(menuAdmin?.name).toBe('Comunicación interna');
        expect(menuAdmin?.submodules.map((submodulo) => submodulo.code)).toEqual(codigos.slice(1));
        expect(menuEmpleado?.submodules.map((submodulo) => submodulo.code)).toEqual(['comms-my']);
        expect(menuLogin(memoria, 12).find((modulo) => modulo.code === 'internal-comms')?.submodules.map((s) => s.code)).toEqual([
            'comms-my',
        ]);

        const conteos = { modulos: memoria.modulos.length, permisos: memoria.permisos.length };
        const segunda = await aplicarBackfillModulos(memoria);
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
            {
                idModulo: 70,
                idTenant: 4,
                codigo: 'internal-comms',
                descripcion: 'Comunicación interna',
                idPadre: null,
            },
            {
                idModulo: 71,
                idTenant: 4,
                codigo: 'comms-my',
                descripcion: 'Mis comunicados',
                idPadre: 70,
            },
        );
        memoria.permisos.push({
            idTenant: 4,
            idRol: 40,
            idModulo: 71,
            puedeVer: true,
            puedeCrear: false,
            puedeActualizar: false,
            puedeEliminar: false,
            activo: true,
        });

        const resumen = await aplicarBackfillModulos(memoria);
        expect(resumen).toEqual([{ idTenant: 4, modulosCreados: 4, permisosCreados: 7 }]);

        const hijosNuevos = memoria.modulos.filter(
            (modulo) => modulo.idTenant === 4 && modulo.codigo !== 'internal-comms' && modulo.codigo !== 'comms-my',
        );
        expect(hijosNuevos).toHaveLength(4);
        expect(hijosNuevos.every((modulo) => modulo.idPadre === 70)).toBe(true);
        expect(memoria.permisos.find((permiso) => permiso.idRol === 40 && permiso.idModulo === 71)).toMatchObject({
            puedeVer: true,
            puedeCrear: false,
            puedeActualizar: false,
            puedeEliminar: false,
        });

        const otra = await aplicarBackfillModulos(memoria);
        expect(otra).toEqual([{ idTenant: 4, modulosCreados: 0, permisosCreados: 0 }]);
        expect(memoria.permisos.find((permiso) => permiso.idRol === 40 && permiso.idModulo === 71)?.puedeCrear).toBe(false);
    });
});
