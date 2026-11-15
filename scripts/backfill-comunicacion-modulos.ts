/**
 * Crea, en cada tenant que ya existe, los módulos de Comunicación interna
 * y los permisos de menú que define el blueprint. Idempotente: una segunda
 * corrida no duplica filas y no pisa permisos guardados a mano.
 *
 *   npm run backfill:comunicacion-modulos
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import { PrismaClient } from '../generated/prisma/client';
import {
    MODULE_BLUEPRINTS,
    PERMISSION_BLUEPRINTS,
    ROLE_NAMES,
} from '../src/modules/super-admin/tenants/blueprints/tenant-blueprints';

/** Mismos módulos que el alta de un tenant: el padre y sus hijos, en ese orden. */
export const MODULOS_COMUNICACION = MODULE_BLUEPRINTS.filter(
    (modulo) => modulo.codigo === 'internal-comms' || modulo.codigoPadre === 'internal-comms',
);

const CODIGOS_COMUNICACION = MODULOS_COMUNICACION.map((modulo) => modulo.codigo);

/** Permisos del blueprint que corresponden a esos módulos. No hay una lista paralela. */
export const PERMISOS_COMUNICACION = PERMISSION_BLUEPRINTS.filter((permiso) =>
    CODIGOS_COMUNICACION.includes(permiso.moduloCodigo),
);

const ROLES_DEL_BLUEPRINT = new Set<string>(ROLE_NAMES);

/**
 * El login arma el menú solo con padres que tienen `puedeVer` y al menos un hijo visible.
 * Un rol personalizado necesita el padre `internal-comms` para que se vea `comms-my`.
 */
const MODULOS_ROL_PERSONALIZADO = ['internal-comms', 'comms-my'] as const;

export interface ModuloComunicacion {
    idModulo: number;
    idTenant: number;
    codigo: string;
    descripcion: string;
    idPadre: number | null;
}

export interface RolTenant {
    idRol: number;
    idTenant: number;
    nombre: string;
}

export interface PermisoExistente {
    idRol: number;
    idModulo: number;
}

export interface ModuloNuevo {
    idTenant: number;
    codigo: string;
    descripcion: string;
    idPadre: number | null;
}

export interface PermisoNuevo {
    idTenant: number;
    idRol: number;
    idModulo: number;
    puedeVer: boolean;
    puedeCrear: boolean;
    puedeActualizar: boolean;
    puedeEliminar: boolean;
}

export interface ResumenBackfillTenant {
    idTenant: number;
    modulosCreados: number;
    permisosCreados: number;
}

export interface BackfillModulosStore {
    listarTenants(): Promise<number[]>;
    listarModulos(idTenant: number, codigos: readonly string[]): Promise<ModuloComunicacion[]>;
    insertarModulo(modulo: ModuloNuevo): Promise<ModuloComunicacion>;
    listarRoles(idTenant: number): Promise<RolTenant[]>;
    listarPermisos(idRoles: readonly number[], idModulos: readonly number[]): Promise<PermisoExistente[]>;
    insertarPermisos(permisos: readonly PermisoNuevo[]): Promise<void>;
}

function clavePermiso(idRol: number, idModulo: number): string {
    return `${idRol}|${idModulo}`;
}

export async function aplicarBackfillModulos(store: BackfillModulosStore): Promise<ResumenBackfillTenant[]> {
    const padre = MODULOS_COMUNICACION.find((modulo) => modulo.codigo === 'internal-comms');
    if (!padre) {
        throw new Error('El blueprint no incluye el módulo internal-comms.');
    }

    const tenants = await store.listarTenants();
    const resumen: ResumenBackfillTenant[] = [];

    for (const idTenant of tenants) {
        const existentes = await store.listarModulos(idTenant, CODIGOS_COMUNICACION);
        const porCodigo = new Map<string, ModuloComunicacion>();
        for (const modulo of existentes) {
            if (!porCodigo.has(modulo.codigo)) porCodigo.set(modulo.codigo, modulo);
        }

        let modulosCreados = 0;
        if (!porCodigo.has(padre.codigo)) {
            const creado = await store.insertarModulo({
                idTenant,
                codigo: padre.codigo,
                descripcion: padre.descripcion,
                idPadre: null,
            });
            porCodigo.set(padre.codigo, creado);
            modulosCreados += 1;
        }

        const idPadre = porCodigo.get(padre.codigo)?.idModulo;
        if (idPadre == null) {
            throw new Error(`No se pudo resolver el módulo padre de comunicación del tenant ${idTenant}.`);
        }

        for (const hijo of MODULOS_COMUNICACION) {
            if (hijo.codigoPadre === null || porCodigo.has(hijo.codigo)) continue;
            const creado = await store.insertarModulo({
                idTenant,
                codigo: hijo.codigo,
                descripcion: hijo.descripcion,
                idPadre,
            });
            porCodigo.set(hijo.codigo, creado);
            modulosCreados += 1;
        }

        const roles = await store.listarRoles(idTenant);
        const idModulos = [...porCodigo.values()].map((modulo) => modulo.idModulo);
        const ya = new Set(
            (await store.listarPermisos(roles.map((rol) => rol.idRol), idModulos)).map((permiso) =>
                clavePermiso(permiso.idRol, permiso.idModulo),
            ),
        );

        const nuevos: PermisoNuevo[] = [];
        const encolar = (permiso: PermisoNuevo) => {
            const clave = clavePermiso(permiso.idRol, permiso.idModulo);
            if (ya.has(clave)) return;
            ya.add(clave);
            nuevos.push(permiso);
        };

        for (const rol of roles) {
            if (ROLES_DEL_BLUEPRINT.has(rol.nombre)) {
                for (const plantilla of PERMISOS_COMUNICACION) {
                    if (plantilla.rolName !== rol.nombre) continue;
                    const idModulo = porCodigo.get(plantilla.moduloCodigo)?.idModulo;
                    if (idModulo == null) continue;
                    encolar({
                        idTenant,
                        idRol: rol.idRol,
                        idModulo,
                        puedeVer: plantilla.puedeVer,
                        puedeCrear: plantilla.puedeCrear,
                        puedeActualizar: plantilla.puedeActualizar,
                        puedeEliminar: plantilla.puedeEliminar,
                    });
                }
                continue;
            }

            for (const codigo of MODULOS_ROL_PERSONALIZADO) {
                const idModulo = porCodigo.get(codigo)?.idModulo;
                if (idModulo == null) continue;
                encolar({
                    idTenant,
                    idRol: rol.idRol,
                    idModulo,
                    puedeVer: true,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                });
            }
        }

        if (nuevos.length > 0) await store.insertarPermisos(nuevos);

        resumen.push({
            idTenant,
            modulosCreados,
            permisosCreados: nuevos.length,
        });
    }

    return resumen;
}

function storeDePrisma(prisma: PrismaClient): BackfillModulosStore {
    return {
        async listarTenants() {
            const tenants = await prisma.catTenants.findMany({
                select: { idTenant: true },
                orderBy: { idTenant: 'asc' },
            });
            return tenants.map((tenant) => tenant.idTenant);
        },
        async listarModulos(idTenant, codigos) {
            const filas = await prisma.catModulos.findMany({
                where: { idTenant, Codigo: { in: [...codigos] } },
                select: { idModulo: true, idTenant: true, Codigo: true, Descripcion: true, idPadre: true },
                orderBy: { idModulo: 'asc' },
            });
            return filas.flatMap((fila) =>
                fila.Codigo && fila.idTenant != null
                    ? [
                          {
                              idModulo: fila.idModulo,
                              idTenant: fila.idTenant,
                              codigo: fila.Codigo,
                              descripcion: fila.Descripcion ?? '',
                              idPadre: fila.idPadre,
                          },
                      ]
                    : [],
            );
        },
        async insertarModulo(modulo) {
            const creado = await prisma.catModulos.create({
                data: {
                    idTenant: modulo.idTenant,
                    Descripcion: modulo.descripcion,
                    Codigo: modulo.codigo,
                    idPadre: modulo.idPadre,
                    Activo: true,
                },
            });
            return {
                idModulo: creado.idModulo,
                idTenant: modulo.idTenant,
                codigo: modulo.codigo,
                descripcion: modulo.descripcion,
                idPadre: modulo.idPadre,
            };
        },
        async listarRoles(idTenant) {
            const roles = await prisma.catRoles.findMany({
                where: { idTenant },
                select: { idRol: true, idTenant: true, descripcion: true },
                orderBy: { idRol: 'asc' },
            });
            return roles.flatMap((rol) =>
                rol.idTenant != null
                    ? [{ idRol: rol.idRol, idTenant: rol.idTenant, nombre: rol.descripcion }]
                    : [],
            );
        },
        async listarPermisos(idRoles, idModulos) {
            if (idRoles.length === 0 || idModulos.length === 0) return [];
            return prisma.relRolPermisos.findMany({
                where: { idRol: { in: [...idRoles] }, idModulo: { in: [...idModulos] } },
                select: { idRol: true, idModulo: true },
            });
        },
        async insertarPermisos(permisos) {
            if (permisos.length === 0) return;
            await prisma.relRolPermisos.createMany({
                data: permisos.map((permiso) => ({
                    idTenant: permiso.idTenant,
                    idRol: permiso.idRol,
                    idModulo: permiso.idModulo,
                    puedeVer: permiso.puedeVer,
                    puedeCrear: permiso.puedeCrear,
                    puedeActualizar: permiso.puedeActualizar,
                    puedeEliminar: permiso.puedeEliminar,
                    activo: true,
                })),
            });
        },
    };
}

function imprimirResumen(resumen: ResumenBackfillTenant[]) {
    for (const fila of resumen) {
        console.log(
            `Tenant ${fila.idTenant}: módulos creados ${fila.modulosCreados}, permisos creados ${fila.permisosCreados}`,
        );
    }
    const modulos = resumen.reduce((suma, fila) => suma + fila.modulosCreados, 0);
    const permisos = resumen.reduce((suma, fila) => suma + fila.permisosCreados, 0);
    console.log(
        `Backfill de comunicación listo. Módulos creados: ${modulos}. Permisos creados: ${permisos}.`,
    );
}

async function main() {
    dotenv.config();
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('Falta DATABASE_URL. No se pueden crear los módulos de comunicación.');
    }

    const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
    try {
        const resumen = await aplicarBackfillModulos(storeDePrisma(prisma));
        imprimirResumen(resumen);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : 'Error al crear los módulos de comunicación';
        console.error(mensaje);
        process.exit(1);
    });
}
