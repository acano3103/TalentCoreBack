/**
 * Crea, en cada tenant que ya existe, los módulos de rutas de aprendizaje,
 * el plan de carrera y el de configuración de capacitación, con los permisos del blueprint.
 * Idempotente: una segunda corrida no duplica filas y no pisa permisos guardados a mano.
 *
 *   npm run backfill:rutas-modulos
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import { PrismaClient } from '../generated/prisma/client';
import {
    MODULE_BLUEPRINTS,
    PERMISSION_BLUEPRINTS,
    ROLE_NAMES,
} from '../src/modules/super-admin/tenants/blueprints/tenant-blueprints';

/** Módulos nuevos. job-courses se conserva y career-plan-config es alias de training-config. */
export const CODIGOS_RUTAS = [
    'learning-paths',
    'training-pending',
    'training-compliance',
    'career-plan',
    'training-config',
] as const;

export const MODULOS_RUTAS = MODULE_BLUEPRINTS.filter((modulo) =>
    (CODIGOS_RUTAS as readonly string[]).includes(modulo.codigo),
);

/** Permisos del blueprint que corresponden a esos módulos. No hay una lista paralela. */
export const PERMISOS_RUTAS = PERMISSION_BLUEPRINTS.filter((permiso) =>
    (CODIGOS_RUTAS as readonly string[]).includes(permiso.moduloCodigo),
);

const ROLES_DEL_BLUEPRINT = new Set<string>(ROLE_NAMES);

export interface ModuloRuta {
    idModulo: number;
    idTenant: number;
    codigo: string;
    descripcion: string;
    idPadre: number | null;
    activo?: boolean;
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
    modulosActivados: number;
    permisosCreados: number;
    rolesActualizados: number;
}

export interface BackfillRutasStore {
    listarTenants(): Promise<number[]>;
    listarModulos(idTenant: number, codigos: readonly string[]): Promise<ModuloRuta[]>;
    insertarModulo(modulo: ModuloNuevo): Promise<ModuloRuta>;
    activarModulo(idModulo: number): Promise<void>;
    listarRoles(idTenant: number): Promise<RolTenant[]>;
    listarPermisos(idRoles: readonly number[], idModulos: readonly number[]): Promise<PermisoExistente[]>;
    insertarPermisos(permisos: readonly PermisoNuevo[]): Promise<void>;
}

function clavePermiso(idRol: number, idModulo: number): string {
    return `${idRol}|${idModulo}`;
}

function codigosAConsultar(): string[] {
    const padres = MODULOS_RUTAS.map((modulo) => modulo.codigoPadre).filter((codigo): codigo is string => codigo != null);
    return [...new Set([...CODIGOS_RUTAS, ...padres])];
}

export async function aplicarBackfillRutas(store: BackfillRutasStore): Promise<ResumenBackfillTenant[]> {
    const tenants = await store.listarTenants();
    const resumen: ResumenBackfillTenant[] = [];
    const codigos = codigosAConsultar();
    const padres = [
        ...new Set(MODULOS_RUTAS.map((modulo) => modulo.codigoPadre).filter((codigo): codigo is string => codigo != null)),
    ];

    for (const idTenant of tenants) {
        const existentes = await store.listarModulos(idTenant, codigos);
        const porCodigo = new Map<string, ModuloRuta>();
        for (const modulo of existentes) {
            if (!porCodigo.has(modulo.codigo)) porCodigo.set(modulo.codigo, modulo);
        }

        let modulosCreados = 0;
        let modulosActivados = 0;
        const padresCreados = new Set<string>();

        for (const codigoPadre of padres) {
            let padre = porCodigo.get(codigoPadre);
            if (!padre) {
                const plantilla = MODULE_BLUEPRINTS.find((modulo) => modulo.codigo === codigoPadre);
                if (!plantilla) {
                    throw new Error(`El blueprint no incluye el módulo padre ${codigoPadre}.`);
                }
                padre = await store.insertarModulo({
                    idTenant,
                    codigo: plantilla.codigo,
                    descripcion: plantilla.descripcion,
                    idPadre: null,
                });
                porCodigo.set(codigoPadre, padre);
                padresCreados.add(codigoPadre);
                modulosCreados += 1;
            }

            for (const hijo of MODULOS_RUTAS) {
                if (hijo.codigoPadre !== codigoPadre || porCodigo.has(hijo.codigo)) continue;
                const creado = await store.insertarModulo({
                    idTenant,
                    codigo: hijo.codigo,
                    descripcion: hijo.descripcion,
                    idPadre: padre.idModulo,
                });
                porCodigo.set(hijo.codigo, creado);
                modulosCreados += 1;
            }
        }

        for (const codigo of CODIGOS_RUTAS) {
            const modulo = porCodigo.get(codigo);
            if (!modulo || modulo.activo !== false) continue;
            await store.activarModulo(modulo.idModulo);
            modulo.activo = true;
            modulosActivados += 1;
        }

        const roles = await store.listarRoles(idTenant);
        const idModulos = [...porCodigo.values()].map((modulo) => modulo.idModulo);
        const ya = new Set(
            (await store.listarPermisos(roles.map((rol) => rol.idRol), idModulos)).map((permiso) =>
                clavePermiso(permiso.idRol, permiso.idModulo),
            ),
        );

        const plantillas = PERMISSION_BLUEPRINTS.filter((permiso) => {
            if ((CODIGOS_RUTAS as readonly string[]).includes(permiso.moduloCodigo)) return true;
            return padresCreados.has(permiso.moduloCodigo);
        });

        const nuevos: PermisoNuevo[] = [];
        const encolar = (permiso: PermisoNuevo) => {
            const clave = clavePermiso(permiso.idRol, permiso.idModulo);
            if (ya.has(clave)) return;
            ya.add(clave);
            nuevos.push(permiso);
        };

        for (const rol of roles) {
            if (!ROLES_DEL_BLUEPRINT.has(rol.nombre)) continue;
            for (const plantilla of plantillas) {
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
        }

        if (nuevos.length > 0) await store.insertarPermisos(nuevos);

        resumen.push({
            idTenant,
            modulosCreados,
            modulosActivados,
            permisosCreados: nuevos.length,
            rolesActualizados: new Set(nuevos.map((permiso) => permiso.idRol)).size,
        });
    }

    return resumen;
}

function storeDePrisma(prisma: PrismaClient): BackfillRutasStore {
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
                select: { idModulo: true, idTenant: true, Codigo: true, Descripcion: true, idPadre: true, Activo: true },
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
                              activo: fila.Activo !== false,
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
                activo: true,
            };
        },
        async activarModulo(idModulo) {
            await prisma.catModulos.update({
                where: { idModulo },
                data: { Activo: true },
            });
        },
        async listarRoles(idTenant) {
            const roles = await prisma.catRoles.findMany({
                where: { idTenant },
                select: { idRol: true, idTenant: true, descripcion: true },
                orderBy: { idRol: 'asc' },
            });
            return roles.flatMap((rol) =>
                rol.idTenant != null ? [{ idRol: rol.idRol, idTenant: rol.idTenant, nombre: rol.descripcion }] : [],
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
            `Tenant ${fila.idTenant}: módulos creados ${fila.modulosCreados}, módulos activados ${fila.modulosActivados}, permisos creados ${fila.permisosCreados}, roles actualizados ${fila.rolesActualizados}`,
        );
    }
    const modulos = resumen.reduce((suma, fila) => suma + fila.modulosCreados, 0);
    const activados = resumen.reduce((suma, fila) => suma + fila.modulosActivados, 0);
    const permisos = resumen.reduce((suma, fila) => suma + fila.permisosCreados, 0);
    const roles = resumen.reduce((suma, fila) => suma + fila.rolesActualizados, 0);
    console.log(
        `Backfill de rutas listo. Módulos creados: ${modulos}. Módulos activados: ${activados}. Permisos creados: ${permisos}. Roles actualizados: ${roles}.`,
    );
}

async function main() {
    dotenv.config();
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('Falta DATABASE_URL. No se pueden crear los módulos de rutas.');
    }

    const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
    try {
        const resumen = await aplicarBackfillRutas(storeDePrisma(prisma));
        imprimirResumen(resumen);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : 'Error al crear los módulos de rutas';
        console.error(mensaje);
        process.exit(1);
    });
}
