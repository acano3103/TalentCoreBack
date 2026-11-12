import { HttpException, HttpStatus } from '@nestjs/common';

export const MENSAJE_KIOSCO_NO_ACTIVO =
    'Este equipo fue desactivado. Pide a RH un código nuevo.';

export function errorKiosco(
    status: HttpStatus,
    code: string,
    message: string,
    detail?: unknown,
): HttpException {
    const body: { code: string; message: string; detail?: unknown } = { code, message };
    if (detail !== undefined) body.detail = detail;
    return new HttpException(body, status);
}
