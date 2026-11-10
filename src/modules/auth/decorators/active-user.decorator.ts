import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActiveUserDto } from '../dto/active-user.dto';

export const GetActiveUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): ActiveUserDto => {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    },
);