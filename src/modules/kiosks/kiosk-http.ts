import { HttpException, HttpStatus } from '@nestjs/common';

export const MENSAJE_KIOSCO_NO_ACTIVO =
    'Este equipo fue desactivado. Pide a RH un código nuevo.';

export function errorKiosco(status: HttpStatus, code: string, message: string): HttpException {
    return new HttpException({ code, message }, status);
}
