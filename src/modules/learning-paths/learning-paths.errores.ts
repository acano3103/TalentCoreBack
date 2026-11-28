import { HttpException, HttpStatus } from '@nestjs/common';

export function errorRuta(
  status: HttpStatus,
  codigo: string,
  message: string,
): HttpException {
  return new HttpException({ code: codigo, codigo, message }, status);
}
