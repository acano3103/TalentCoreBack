import { NotFoundException } from '@nestjs/common';

export function cursoNoAsignado(): never {
    throw new NotFoundException({
        code: 'CURSO_NO_ASIGNADO',
        message: 'No tienes asignado este curso.',
    });
}

// El player web responde 404 con este texto cuando la sesión no es del empleado. La app necesita el código.
export function relanzarSiNoAsignado(error: unknown): never {
    if (error instanceof NotFoundException) {
        const body = error.getResponse();
        const message = typeof body === 'string' ? body : (body as { message?: unknown }).message;
        const texto = Array.isArray(message) ? message.join(' ') : message;
        if (typeof texto === 'string' && texto.includes('No tienes asignado')) {
            cursoNoAsignado();
        }
    }
    throw error;
}
