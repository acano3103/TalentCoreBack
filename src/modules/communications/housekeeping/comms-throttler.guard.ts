import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class CommsThrottlerGuard extends ThrottlerGuard {
    protected async throwThrottlingException(
        _context: ExecutionContext,
        _detail: ThrottlerLimitDetail,
    ): Promise<void> {
        throw new HttpException(
            {
                code: 'DEMASIADAS_SOLICITUDES',
                message: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
            },
            HttpStatus.TOO_MANY_REQUESTS,
        );
    }
}
