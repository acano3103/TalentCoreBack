/**
 * Sección 8.3. La campana (SOCKETS) y el kiosco no están en la matriz: siempre se entregan.
 * Estas celdas no se pueden apagar; la respuesta lleva `bloqueada: true` para mostrar «Siempre».
 * La prioridad CRÍTICA también se entrega aunque la persona haya apagado la celda.
 */
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
    prioridad?: string | null;
    preferenciaActiva: boolean | null;
}): boolean {
    const canal = canalDeCatalogo(entrada.codigo);
    if (!canal) return true;
    if (normalizar(entrada.prioridad) === 'CRITICA') return true;
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
