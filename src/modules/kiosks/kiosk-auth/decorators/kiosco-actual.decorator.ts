import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SesionKiosco } from '../kiosco-actual';

export const KioscoActual = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): SesionKiosco => {
        return ctx.switchToHttp().getRequest().user;
    },
);
