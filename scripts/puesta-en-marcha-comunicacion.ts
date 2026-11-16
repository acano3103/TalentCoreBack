/**
 * Catálogos, plantilla 11.3 y clasificación de puestos para tenants que ya existían.
 * Idempotente: no duplica filas y no pisa capacidades ni tipos de personal ya ajustados.
 */
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { ComAcuseModo, ComPrioridad } from '../generated/prisma/enums';
import {
    CAPACIDADES,
    FilaTipoComunicado,
    filasFaltantes,
    tiposComunicadoDeseados,
    tiposPersonalDeseados,
} from './seed-comunicacion-catalogos';

export const CAPACIDADES_FASE_1 = CAPACIDADES.filter((fila) => fila.fase === 1).map((fila) => fila.codigo);

const TIPOS_MANAGER = ['GENERAL', 'AVISO_OPERATIVO', 'AVISO_EQUIPO'] as const;

export interface TipoPersonalExistente {
    id: number;
    codigo: string;
}

export interface CapacidadCatalogo {
    id: number;
    codigo: string;
}

export interface RolSimple {
    idRol: number;
    nombre: string;
}

export interface AsignacionNueva {
    idTenant: number;
    idRol: number;
    idCapacidad: number;
    alcance: 'EMPRESAS' | 'ESTRUCTURA';
    referencias: number[] | null;
    tiposPermitidos: string[] | null;
}

export interface PuestoDefault {
    idPuesto: number;
    clasificacion: string | null;
}

export interface ResumenPuestaEnMarcha {
    idTenant: number;
    tiposPersonalCreados: number;
    tiposComunicadoCreados: number;
    configsCreadas: number;
    rolesConPlantilla: number;
    capacidadesAsignadas: number;
    puestosActualizados: number;
    puestosSinMapear: number;
}

export interface PuestaEnMarchaStore {
    listarTenants(): Promise<number[]>;
    listarTiposPersonal(idTenant: number): Promise<TipoPersonalExistente[]>;
    insertarTiposPersonal(idTenant: number, filas: { codigo: string; nombre: string }[]): Promise<void>;
    listarCodigosComunicado(idTenant: number): Promise<string[]>;
    insertarTiposComunicado(filas: readonly FilaTipoComunicado[]): Promise<void>;
    listarEmpresas(idTenant: number): Promise<number[]>;
    listarEmpresasConConfig(idEmpresas: readonly number[]): Promise<number[]>;
    insertarConfigs(filas: { idTenant: number; idEmpresa: number }[]): Promise<void>;
    listarCapacidades(): Promise<CapacidadCatalogo[]>;
    listarRoles(idTenant: number): Promise<RolSimple[]>;
    rolesConAlgunaCapacidad(idRoles: readonly number[]): Promise<number[]>;
    insertarAsignaciones(filas: readonly AsignacionNueva[]): Promise<void>;
    listarPuestosEnDefault(idTenant: number, idTipoAdministrativo: number): Promise<PuestoDefault[]>;
    actualizarTipoPersonal(idPuestos: readonly number[], idTipoPersonal: number): Promise<number>;
}

export function codigoTipoDeClasificacion(nombre: string | null): 'OPERATIVO' | 'ADMINISTRATIVO' | 'DIRECTIVO' | null {
    const normal = (nombre ?? '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
    if (normal === 'OPERATIVO') return 'OPERATIVO';
    if (normal === 'ADMINISTRATIVO') return 'ADMINISTRATIVO';
    if (normal === 'DIRECTIVO' || normal === 'GERENCIAL' || normal === 'EJECUTIVO') return 'DIRECTIVO';
    return null;
}

interface FilaPlantilla {
    codigo: string;
    alcance: 'EMPRESAS' | 'ESTRUCTURA';
    referencias: number[] | null;
    tiposPermitidos: string[] | null;
}

/** null: el rol no entra en la plantilla. []: entra, pero no hay empresas para el alcance. */
export function plantillaDeRol(nombre: string, idEmpresas: readonly number[]): FilaPlantilla[] | null {
    if (nombre === 'Admin' || nombre === 'RH') {
        const referencias = [...idEmpresas].sort((a, b) => a - b);
        if (!referencias.length) return [];
        return CAPACIDADES_FASE_1.map((codigo) => ({
            codigo,
            alcance: 'EMPRESAS' as const,
            referencias,
            tiposPermitidos: null,
        }));
    }
    if (nombre === 'Manager') {
        return [
            {
                codigo: 'COM_CREAR',
                alcance: 'ESTRUCTURA',
                referencias: null,
                tiposPermitidos: [...TIPOS_MANAGER],
            },
            { codigo: 'COM_AVISO_OPERATIVO', alcance: 'ESTRUCTURA', referencias: null, tiposPermitidos: null },
            { codigo: 'COM_VER_ANALITICA', alcance: 'ESTRUCTURA', referencias: null, tiposPermitidos: null },
        ];
    }
    return null;
}

export async function aplicarPuestaEnMarcha(store: PuestaEnMarchaStore): Promise<ResumenPuestaEnMarcha[]> {
    const capacidades = await store.listarCapacidades();
    const idCapacidad = new Map(capacidades.map((fila) => [fila.codigo, fila.id]));
    const faltan = CAPACIDADES_FASE_1.filter((codigo) => !idCapacidad.has(codigo));
    if (faltan.length) {
        throw new Error(
            `Faltan capacidades del catálogo (${faltan.join(', ')}). Ejecuta npm run seed:comunicacion antes del backfill.`,
        );
    }

    const resumen: ResumenPuestaEnMarcha[] = [];
    for (const idTenant of await store.listarTenants()) {
        const personal = await store.listarTiposPersonal(idTenant);
        const personalNuevo = filasFaltantes(
            tiposPersonalDeseados([idTenant]),
            (fila) => fila.codigo,
            personal.map((fila) => fila.codigo),
        );
        if (personalNuevo.length) {
            await store.insertarTiposPersonal(idTenant, personalNuevo.map((fila) => ({ codigo: fila.codigo, nombre: fila.nombre })));
        }
        const tipos = await store.listarTiposPersonal(idTenant);

        const comunicadosNuevos = filasFaltantes(
            tiposComunicadoDeseados([idTenant]),
            (fila) => fila.codigo,
            await store.listarCodigosComunicado(idTenant),
        );
        if (comunicadosNuevos.length) await store.insertarTiposComunicado(comunicadosNuevos);

        const empresas = await store.listarEmpresas(idTenant);
        const conConfig = new Set(await store.listarEmpresasConConfig(empresas));
        const configsNuevas = empresas.filter((idEmpresa) => !conConfig.has(idEmpresa)).map((idEmpresa) => ({ idTenant, idEmpresa }));
        if (configsNuevas.length) await store.insertarConfigs(configsNuevas);

        const roles = await store.listarRoles(idTenant);
        const ocupados = new Set(await store.rolesConAlgunaCapacidad(roles.map((rol) => rol.idRol)));
        const asignaciones: AsignacionNueva[] = [];
        const rolesPlantilla = new Set<number>();
        for (const rol of roles) {
            if (ocupados.has(rol.idRol)) continue;
            const plantilla = plantillaDeRol(rol.nombre, empresas);
            if (!plantilla?.length) continue;
            for (const fila of plantilla) {
                const id = idCapacidad.get(fila.codigo);
                if (id == null) continue;
                asignaciones.push({
                    idTenant,
                    idRol: rol.idRol,
                    idCapacidad: id,
                    alcance: fila.alcance,
                    referencias: fila.referencias,
                    tiposPermitidos: fila.tiposPermitidos,
                });
            }
            rolesPlantilla.add(rol.idRol);
        }
        if (asignaciones.length) await store.insertarAsignaciones(asignaciones);

        const idPorCodigo = new Map(tipos.map((fila) => [fila.codigo, fila.id]));
        const idAdmin = idPorCodigo.get('ADMINISTRATIVO');
        let puestosActualizados = 0;
        let puestosSinMapear = 0;
        if (idAdmin != null) {
            const puestos = await store.listarPuestosEnDefault(idTenant, idAdmin);
            const porTipo = new Map<number, number[]>();
            for (const puesto of puestos) {
                const codigo = codigoTipoDeClasificacion(puesto.clasificacion);
                const idDestino = codigo ? idPorCodigo.get(codigo) : undefined;
                if (!codigo || idDestino == null) {
                    puestosSinMapear += 1;
                    continue;
                }
                if (idDestino === idAdmin) continue;
                const lista = porTipo.get(idDestino) ?? [];
                lista.push(puesto.idPuesto);
                porTipo.set(idDestino, lista);
            }
            for (const [idTipoPersonal, idPuestos] of porTipo) {
                puestosActualizados += await store.actualizarTipoPersonal(idPuestos, idTipoPersonal);
            }
        }

        resumen.push({
            idTenant,
            tiposPersonalCreados: personalNuevo.length,
            tiposComunicadoCreados: comunicadosNuevos.length,
            configsCreadas: configsNuevas.length,
            rolesConPlantilla: rolesPlantilla.size,
            capacidadesAsignadas: asignaciones.length,
            puestosActualizados,
            puestosSinMapear,
        });
    }
    return resumen;
}

export function storePuestaDePrisma(prisma: PrismaClient): PuestaEnMarchaStore {
    return {
        async listarTenants() {
            const tenants = await prisma.catTenants.findMany({ select: { idTenant: true }, orderBy: { idTenant: 'asc' } });
            return tenants.map((tenant) => tenant.idTenant);
        },
        async listarTiposPersonal(idTenant) {
            const filas = await prisma.catTiposPersonal.findMany({
                where: { idTenant },
                select: { idTipoPersonal: true, Codigo: true },
            });
            return filas.map((fila) => ({ id: fila.idTipoPersonal, codigo: fila.Codigo }));
        },
        async insertarTiposPersonal(idTenant, filas) {
            if (!filas.length) return;
            await prisma.catTiposPersonal.createMany({
                data: filas.map((fila) => ({ idTenant, Codigo: fila.codigo, Nombre: fila.nombre, Activo: true })),
            });
        },
        async listarCodigosComunicado(idTenant) {
            const filas = await prisma.comTiposComunicado.findMany({ where: { idTenant }, select: { Codigo: true } });
            return filas.map((fila) => fila.Codigo);
        },
        async insertarTiposComunicado(filas) {
            if (!filas.length) return;
            await prisma.comTiposComunicado.createMany({
                data: filas.map((fila) => ({
                    idTenant: fila.idTenant,
                    Codigo: fila.codigo,
                    Nombre: fila.nombre,
                    PrioridadDefault: fila.prioridadDefault as ComPrioridad,
                    AcuseDefault: fila.acuseDefault as ComAcuseModo,
                    ModalDefault: fila.modalDefault,
                    IdentidadDefault: fila.identidadDefault,
                    EsCorto: fila.esCorto,
                    Activo: true,
                })),
            });
        },
        async listarEmpresas(idTenant) {
            const filas = await prisma.catEmpresas.findMany({
                where: { idTenant },
                select: { idEmpresa: true },
                orderBy: { idEmpresa: 'asc' },
            });
            return filas.map((fila) => fila.idEmpresa);
        },
        async listarEmpresasConConfig(idEmpresas) {
            if (!idEmpresas.length) return [];
            const filas = await prisma.comConfigEmpresa.findMany({
                where: { idEmpresa: { in: [...idEmpresas] } },
                select: { idEmpresa: true },
            });
            return filas.map((fila) => fila.idEmpresa);
        },
        async insertarConfigs(filas) {
            if (!filas.length) return;
            await prisma.comConfigEmpresa.createMany({
                data: filas.map((fila) => ({ idEmpresa: fila.idEmpresa, idTenant: fila.idTenant })),
            });
        },
        async listarCapacidades() {
            const filas = await prisma.catComCapacidades.findMany({ select: { idCapacidad: true, Codigo: true } });
            return filas.map((fila) => ({ id: fila.idCapacidad, codigo: fila.Codigo }));
        },
        async listarRoles(idTenant) {
            const roles = await prisma.catRoles.findMany({
                where: { idTenant },
                select: { idRol: true, descripcion: true },
                orderBy: { idRol: 'asc' },
            });
            return roles.map((rol) => ({ idRol: rol.idRol, nombre: rol.descripcion }));
        },
        async rolesConAlgunaCapacidad(idRoles) {
            if (!idRoles.length) return [];
            const filas = await prisma.relRolComCapacidad.findMany({
                where: { idRol: { in: [...idRoles] } },
                select: { idRol: true },
                distinct: ['idRol'],
            });
            return filas.map((fila) => fila.idRol);
        },
        async insertarAsignaciones(filas) {
            if (!filas.length) return;
            await prisma.relRolComCapacidad.createMany({
                data: filas.map((fila) => ({
                    idTenant: fila.idTenant,
                    idRol: fila.idRol,
                    idCapacidad: fila.idCapacidad,
                    Alcance: fila.alcance,
                    Referencias: fila.referencias ?? Prisma.DbNull,
                    TiposPermitidos: fila.tiposPermitidos ?? Prisma.DbNull,
                    RequiereAprobacion: false,
                })),
            });
        },
        async listarPuestosEnDefault(idTenant, idTipoAdministrativo) {
            const puestos = await prisma.catPuestos.findMany({
                where: { idTenant, idTipoPersonal: idTipoAdministrativo },
                select: { idPuesto: true, idTipoPuesto: true },
            });
            const idsTipo = [...new Set(puestos.flatMap((puesto) => (puesto.idTipoPuesto == null ? [] : [puesto.idTipoPuesto])))];
            const tipos = idsTipo.length
                ? await prisma.catTipoPuesto.findMany({
                    where: { idTipoPuesto: { in: idsTipo } },
                    select: { idTipoPuesto: true, Descripcion: true },
                })
                : [];
            const nombre = new Map(tipos.map((tipo) => [tipo.idTipoPuesto, tipo.Descripcion]));
            return puestos.map((puesto) => ({
                idPuesto: puesto.idPuesto,
                clasificacion: puesto.idTipoPuesto == null ? null : nombre.get(puesto.idTipoPuesto) ?? null,
            }));
        },
        async actualizarTipoPersonal(idPuestos, idTipoPersonal) {
            if (!idPuestos.length) return 0;
            const resultado = await prisma.catPuestos.updateMany({
                where: { idPuesto: { in: [...idPuestos] } },
                data: { idTipoPersonal },
            });
            return resultado.count;
        },
    };
}

export function imprimirPuestaEnMarcha(resumen: ResumenPuestaEnMarcha[]): void {
    for (const fila of resumen) {
        console.log(
            `Tenant ${fila.idTenant}: personal ${fila.tiposPersonalCreados}, tipos de comunicado ${fila.tiposComunicadoCreados}, ` +
            `config ${fila.configsCreadas}, roles con plantilla ${fila.rolesConPlantilla}, capacidades ${fila.capacidadesAsignadas}, ` +
            `puestos actualizados ${fila.puestosActualizados}, puestos sin mapear ${fila.puestosSinMapear}`,
        );
    }
}
