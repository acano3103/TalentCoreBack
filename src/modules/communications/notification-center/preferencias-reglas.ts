/**
 * Sección 8.3. La campana (SOCKETS) y el kiosco no están en la matriz: siempre se entregan.
 * Estas celdas no se pueden apagar; la respuesta lleva `bloqueada: true` para mostrar «Siempre».
 * También se entrega aunque la celda esté apagada si la prioridad es CRÍTICA o IMPORTANTE,
 * si el comunicado pide acuse, o si es un recordatorio de checada (R1 o R2).
 * CELEBRACION es fase 2: se muestra, no se edita y no fuerza el envío.
 */

export const FILAS_INFORMATIVAS = [
    { nombre: 'Comunicados importantes y con confirmación', bloqueada: true as const },
    { nombre: 'Recordatorios de checada', bloqueada: true as const },
] as const;
export const CATEGORIAS_PREFERENCIA = [
    'COMUNICADO',
    'AVISO',
    'RECORDATORIO',
    'APROBACION',
    'CELEBRACION',
    'SISTEMA',
] as const;

export const CANALES_PREFERENCIA = ['PUSH', 'CORREO', 'WHATSAPP'] as const;

export type CategoriaPreferencia = (typeof CATEGORIAS_PREFERENCIA)[number];
export type CanalPreferencia = (typeof CANALES_PREFERENCIA)[number];

const BLOQUEADAS = new Set<string>([
    'APROBACION|PUSH',
    'APROBACION|CORREO',
    'APROBACION|WHATSAPP',
    'SISTEMA|PUSH',
    'SISTEMA|CORREO',
]);

export function preferenciaBloqueada(categoria: string, canal: string): boolean {
    return BLOQUEADAS.has(`${normalizar(categoria)}|${normalizar(canal)}`);
}

/** La matriz no deja editar estas celdas. Celebraciones quedan visibles pero en fase 2. */
export function preferenciaNoEditable(categoria: string, canal: string): boolean {
    return preferenciaBloqueada(categoria, canal) || normalizar(categoria) === 'CELEBRACION';
}

export function fasePreferencia(categoria: string): 1 | 2 {
    return normalizar(categoria) === 'CELEBRACION' ? 2 : 1;
}

/** R1 y R2 avisan la checada. R12 («antes de la entrada») sí respeta la preferencia. */
export function esRecordatorioChecada(codigo?: string | null, origenId?: string | null): boolean {
    const regla = normalizar(codigo);
    if (regla === 'R1' || regla === 'R2') return true;
    const origen = normalizar(origenId);
    if (origen.startsWith('R10:') || origen.startsWith('R11:') || origen.startsWith('R12:')) return false;
    return origen.startsWith('R1:') || origen.startsWith('R2:');
}

export function categoriaDePreferencia(origen: {
    categoria?: string | null;
    notificationTypeCode?: string | null;
    origenTipo?: string | null;
}): CategoriaPreferencia {
    const candidatos = [origen.categoria, origen.notificationTypeCode, origen.origenTipo];
    for (const valor of candidatos) {
        const normal = normalizar(valor);
        if ((CATEGORIAS_PREFERENCIA as readonly string[]).includes(normal)) return normal as CategoriaPreferencia;
    }
    return 'COMUNICADO';
}

export function canalDeCatalogo(codigo: string): CanalPreferencia | null {
    const normal = normalizar(codigo);
    if (normal === 'EMAIL' || normal === 'CORREO') return 'CORREO';
    if (normal === 'PUSH' || normal === 'WHATSAPP') return normal;
    return null;
}

export function codigoCanalCatalogo(canal: CanalPreferencia): 'PUSH' | 'EMAIL' | 'WHATSAPP' {
    return canal === 'CORREO' ? 'EMAIL' : canal;
}

/** null en la preferencia significa que la persona no eligió: se envía. */
export function debeEnviarCanal(entrada: {
    codigo: string;
    categoria?: string | null;
    notificationTypeCode?: string | null;
    origenTipo?: string | null;
    origenId?: string | null;
    codigoRegla?: string | null;
    prioridad?: string | null;
    requiereAcuse?: boolean | null;
    preferenciaActiva: boolean | null;
}): boolean {
    const canal = canalDeCatalogo(entrada.codigo);
    if (!canal) return true;
    const prioridad = normalizar(entrada.prioridad);
    if (prioridad === 'CRITICA' || prioridad === 'IMPORTANTE') return true;
    if (entrada.requiereAcuse) return true;
    if (esRecordatorioChecada(entrada.codigoRegla, entrada.origenId)) return true;
    const categoria = categoriaDePreferencia(entrada);
    if (preferenciaBloqueada(categoria, canal)) return true;
    return entrada.preferenciaActiva !== false;
}

function normalizar(valor?: string | null): string {
    return (valor ?? '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
}
