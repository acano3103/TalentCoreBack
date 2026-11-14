import { createHash } from 'crypto';

/** Mayúsculas, sin espacios ni guiones. El hash se calcula después, sobre este valor. */
export function normalizarCodigoActivacion(codigo: string): string {
    return codigo.toUpperCase().replace(/[\s-]/g, '');
}

/** Mismo SHA-256 que se guarda al crear o regenerar el código. No normaliza. */
export function hashActivationCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
}
