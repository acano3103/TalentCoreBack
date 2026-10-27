// CURP: 18 caracteres (4 letras, 6 dígitos de fecha, H/M, 5 letras, homoclave y dígito verificador).
// Misma expresión que ya usa la carga masiva de expedientes.
export const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/;

// Quita espacios y caracteres invisibles (al copiar y pegar, o celdas de Excel) y pasa a mayúsculas.
// No recorta: si sobran o faltan caracteres, esCurpValida() lo detecta.
export function normalizarCurp(valor: unknown): string {
    return String(valor ?? '')
        .toUpperCase()
        .replace(/[\s​-‍⁠﻿]/g, '');
}

export function esCurpValida(curp: string): boolean {
    return CURP_REGEX.test(curp);
}
