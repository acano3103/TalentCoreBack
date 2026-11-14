const BIOMETRICOS = new Set(['BIOMETRICO', 'BIOMÉTRICO', 'ROSTRO', 'HUELLA', 'FACE', 'FACIAL']);

/** Hoy el kiosco checa por número. El biométrico queda listo para cuando exista el método. */
export function metodoDeChecada(metodo: string | null | undefined): 'KIOSCO_PIN' | 'KIOSCO_BIOMETRICO' {
    const valor = (metodo ?? 'NUMERO').trim().toUpperCase();
    if (BIOMETRICOS.has(valor)) return 'KIOSCO_BIOMETRICO';
    return 'KIOSCO_PIN';
}

export function visibleEnKiosco(entrada: {
    canales: readonly string[];
    esCorto: boolean;
    acuseModo: string;
    estadoDestinatario: string;
}): boolean {
    if (!entrada.canales.includes('KIOSCO')) return false;
    if (entrada.esCorto) return true;
    return entrada.acuseModo !== 'NINGUNO' && entrada.estadoDestinatario !== 'CONFIRMADO' && entrada.estadoDestinatario !== 'EXPIRADO';
}
