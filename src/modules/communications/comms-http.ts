import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';

export function errorComms(
    status: HttpStatus,
    code: string,
    message: string,
    detail?: unknown,
): HttpException {
    const body: { code: string; message: string; detail?: unknown } = { code, message };
    if (detail !== undefined) body.detail = detail;
    return new HttpException(body, status);
}

export function esP2002(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
