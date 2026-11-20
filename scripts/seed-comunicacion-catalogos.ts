/** Catálogos base de comunicación interna. Idempotentes: una segunda corrida no inserta filas. */

export const TIPOS_PERSONAL = [
    { codigo: 'OPERATIVO', nombre: 'Operativo' },
    { codigo: 'ADMINISTRATIVO', nombre: 'Administrativo' },
    { codigo: 'DIRECTIVO', nombre: 'Directivo' },
] as const;

/**
 * Defaults de la tabla 6.1.
 * Acuse «opcional» o «no» queda en NINGUNO; «obligatorio» en LEI_ENTENDI.
 * Modal «opcional» queda apagado. IdentidadDefault no viene en la tabla: queda en false.
 */
export const TIPOS_COMUNICADO = [
    {
        codigo: 'GENERAL',
        nombre: 'General',
        prioridadDefault: 'NORMAL',
        acuseDefault: 'NINGUNO',
        modalDefault: false,
        identidadDefault: false,
        esCorto: false,
    },
    {
        codigo: 'AVISO_OPERATIVO',
        nombre: 'Aviso operativo',
        prioridadDefault: 'IMPORTANTE',
        acuseDefault: 'NINGUNO',
        modalDefault: false,
        identidadDefault: false,
        esCorto: true,
    },
    {
        codigo: 'CAMBIO_REGLAS',
        nombre: 'Cambio de reglas / jornada',
        prioridadDefault: 'CRITICA',
        acuseDefault: 'LEI_ENTENDI',
        modalDefault: true,
        identidadDefault: false,
        esCorto: false,
    },
    {
        codigo: 'POLITICA',
        nombre: 'Política interna',
        prioridadDefault: 'IMPORTANTE',
        acuseDefault: 'LEI_ENTENDI',
        modalDefault: true,
        identidadDefault: false,
        esCorto: false,
    },
    {
        codigo: 'USO_PLATAFORMA',
        nombre: 'Uso de plataforma',
        prioridadDefault: 'NORMAL',
        acuseDefault: 'NINGUNO',
        modalDefault: false,
        identidadDefault: false,
        esCorto: false,
    },
    {
        codigo: 'AVISO_EQUIPO',
        nombre: 'Aviso de equipo',
        prioridadDefault: 'NORMAL',
        acuseDefault: 'NINGUNO',
        modalDefault: false,
        identidadDefault: false,
        esCorto: false,
    },
] as const;

export const CAPACIDADES = [
    { codigo: 'COM_CREAR', descripcion: 'Crear y enviar comunicados', fase: 1 },
    { codigo: 'COM_AVISO_OPERATIVO', descripcion: 'Enviar avisos operativos', fase: 1 },
    { codigo: 'COM_CRITICO', descripcion: 'Usar prioridad crítica y forzar canales con costo', fase: 1 },
    { codigo: 'COM_VER_ANALITICA', descripcion: 'Ver lecturas y acuses dentro del alcance', fase: 1 },
    { codigo: 'MURO_PUBLICAR', descripcion: 'Publicar en el muro', fase: 2 },
    { codigo: 'MURO_FIJAR', descripcion: 'Fijar posts y crear campañas', fase: 2 },
    { codigo: 'MURO_MODERAR', descripcion: 'Moderar comentarios y atender reportes', fase: 2 },
    { codigo: 'AUD_GESTIONAR', descripcion: 'Crear y editar audiencias guardadas', fase: 1 },
    { codigo: 'CFG_RECORDATORIOS', descripcion: 'Configurar recordatorios automáticos', fase: 1 },
    { codigo: 'CFG_CELEBRACIONES', descripcion: 'Configurar celebraciones', fase: 2 },
    { codigo: 'CFG_CANALES', descripcion: 'Configurar perfiles de canal', fase: 1 },
    { codigo: 'CFG_PERMISOS', descripcion: 'Asignar capacidades y alcances a roles', fase: 1 },
] as const;

export const CAPACIDADES_FASE_2 = ['MURO_PUBLICAR', 'MURO_FIJAR', 'MURO_MODERAR', 'CFG_CELEBRACIONES'] as const;

export const CANALES_NOTIFICACION = [
    { code: 'PUSH', description: 'Notificación push (Expo)' },
    { code: 'KIOSCO', description: 'Kiosco' },
    { code: 'WEB', description: 'Web (tiempo real)' },
] as const;

export const TIPOS_NOTIFICACION = [
    { code: 'COMUNICADO', description: 'Comunicado' },
    { code: 'AVISO', description: 'Aviso' },
    { code: 'RECORDATORIO', description: 'Recordatorio' },
    { code: 'APROBACION', description: 'Aprobación' },
    { code: 'CELEBRACION', description: 'Celebración' },
    { code: 'SISTEMA', description: 'Sistema' },
] as const;

export const DIA_PRECIO_WA_GLOBAL = '2026-01-01';

export const PRECIO_WA_GLOBAL = {
    precioBase: '0.90',
    moneda: 'MXN',
    vigenteDesde: DIA_PRECIO_WA_GLOBAL,
    creadoPor: 'seed-comunicacion',
} as const;

export interface FilaTipoPersonal {
    idTenant: number;
    codigo: string;
    nombre: string;
}

export interface FilaTipoComunicado {
    idTenant: number;
    codigo: string;
    nombre: string;
    prioridadDefault: string;
    acuseDefault: string;
    modalDefault: boolean;
    identidadDefault: boolean;
    esCorto: boolean;
}

export interface FilaCapacidad {
    codigo: string;
    descripcion: string;
    fase: number;
}

export interface FilaCanal {
    code: string;
    description: string;
}

export interface FilaTipoNotificacion {
    code: string;
    description: string;
}

export interface FilaPrecioGlobal {
    precioBase: string;
    moneda: string;
    vigenteDesde: string;
    creadoPor: string;
}

export interface SemillaStore {
    listarTenants(): Promise<number[]>;
    listarTiposPersonal(): Promise<FilaTipoPersonal[]>;
    insertarTiposPersonal(filas: FilaTipoPersonal[]): Promise<void>;
    listarTiposComunicado(): Promise<FilaTipoComunicado[]>;
    insertarTiposComunicado(filas: FilaTipoComunicado[]): Promise<void>;
    listarCapacidades(): Promise<{ codigo: string }[]>;
    insertarCapacidades(filas: FilaCapacidad[]): Promise<void>;
    listarCanales(): Promise<{ code: string }[]>;
    insertarCanales(filas: FilaCanal[]): Promise<void>;
    listarTiposNotificacion(): Promise<{ code: string }[]>;
    insertarTiposNotificacion(filas: FilaTipoNotificacion[]): Promise<void>;
    listarPreciosGlobales(): Promise<{ vigenteDesde: string }[]>;
    insertarPreciosGlobales(filas: FilaPrecioGlobal[]): Promise<void>;
}

export interface ResumenSemilla {
    insertados: {
        tiposPersonal: number;
        tiposComunicado: number;
        capacidades: number;
        canales: number;
        tiposNotificacion: number;
        precios: number;
    };
    total: number;
}

/** Devuelve las filas deseadas cuya clave todavía no está en la base. También descarta duplicados del propio lote. */
export function filasFaltantes<T>(deseadas: readonly T[], clave: (fila: T) => string, clavesExistentes: Iterable<string>): T[] {
    const ya = new Set(clavesExistentes);
    const nuevas: T[] = [];
    for (const fila of deseadas) {
        const key = clave(fila);
        if (ya.has(key)) continue;
        ya.add(key);
        nuevas.push(fila);
    }
    return nuevas;
}

/**
 * Une el día UTC y el día local para que un DATETIME leído con o sin zona
 * siga contando como el precio global del 2026-01-01.
 */
export function clavePrecioGlobal(fecha: Date): string {
    const utc = fecha.toISOString().slice(0, 10);
    const local = [
        fecha.getFullYear(),
        String(fecha.getMonth() + 1).padStart(2, '0'),
        String(fecha.getDate()).padStart(2, '0'),
    ].join('-');
    if (utc === DIA_PRECIO_WA_GLOBAL || local === DIA_PRECIO_WA_GLOBAL) {
        return DIA_PRECIO_WA_GLOBAL;
    }
    return utc;
}

export function tiposPersonalDeseados(tenants: readonly number[]): FilaTipoPersonal[] {
    return tenants.flatMap((idTenant) =>
        TIPOS_PERSONAL.map((tipo) => ({
            idTenant,
            codigo: tipo.codigo,
            nombre: tipo.nombre,
        })),
    );
}

export function tiposComunicadoDeseados(tenants: readonly number[]): FilaTipoComunicado[] {
    return tenants.flatMap((idTenant) =>
        TIPOS_COMUNICADO.map((tipo) => ({
            idTenant,
            codigo: tipo.codigo,
            nombre: tipo.nombre,
            prioridadDefault: tipo.prioridadDefault,
            acuseDefault: tipo.acuseDefault,
            modalDefault: tipo.modalDefault,
            identidadDefault: tipo.identidadDefault,
            esCorto: tipo.esCorto,
        })),
    );
}

export async function aplicarSemillas(store: SemillaStore): Promise<ResumenSemilla> {
    const tenants = await store.listarTenants();
    const insertados = {
        tiposPersonal: 0,
        tiposComunicado: 0,
        capacidades: 0,
        canales: 0,
        tiposNotificacion: 0,
        precios: 0,
    };

    const personalNuevo = filasFaltantes(
        tiposPersonalDeseados(tenants),
        (fila) => `${fila.idTenant}|${fila.codigo}`,
        (await store.listarTiposPersonal()).map((fila) => `${fila.idTenant}|${fila.codigo}`),
    );
    if (personalNuevo.length) {
        await store.insertarTiposPersonal(personalNuevo);
        insertados.tiposPersonal = personalNuevo.length;
    }

    const comunicadosNuevos = filasFaltantes(
        tiposComunicadoDeseados(tenants),
        (fila) => `${fila.idTenant}|${fila.codigo}`,
        (await store.listarTiposComunicado()).map((fila) => `${fila.idTenant}|${fila.codigo}`),
    );
    if (comunicadosNuevos.length) {
        await store.insertarTiposComunicado(comunicadosNuevos);
        insertados.tiposComunicado = comunicadosNuevos.length;
    }

    const capacidadesNuevas = filasFaltantes(
        CAPACIDADES.map((fila) => ({ ...fila })),
        (fila) => fila.codigo,
        (await store.listarCapacidades()).map((fila) => fila.codigo),
    );
    if (capacidadesNuevas.length) {
        await store.insertarCapacidades(capacidadesNuevas);
        insertados.capacidades = capacidadesNuevas.length;
    }

    const canalesNuevos = filasFaltantes(
        CANALES_NOTIFICACION.map((fila) => ({ ...fila })),
        (fila) => fila.code,
        (await store.listarCanales()).map((fila) => fila.code),
    );
    if (canalesNuevos.length) {
        await store.insertarCanales(canalesNuevos);
        insertados.canales = canalesNuevos.length;
    }

    const tiposNotificacionNuevos = filasFaltantes(
        TIPOS_NOTIFICACION.map((fila) => ({ ...fila })),
        (fila) => fila.code,
        (await store.listarTiposNotificacion()).map((fila) => fila.code),
    );
    if (tiposNotificacionNuevos.length) {
        await store.insertarTiposNotificacion(tiposNotificacionNuevos);
        insertados.tiposNotificacion = tiposNotificacionNuevos.length;
    }

    const preciosNuevos = filasFaltantes(
        [{ ...PRECIO_WA_GLOBAL }],
        (fila) => fila.vigenteDesde,
        (await store.listarPreciosGlobales()).map((fila) => fila.vigenteDesde),
    );
    if (preciosNuevos.length) {
        await store.insertarPreciosGlobales(preciosNuevos);
        insertados.precios = preciosNuevos.length;
    }

    const total = Object.values(insertados).reduce((suma, n) => suma + n, 0);
    return { insertados, total };
}
