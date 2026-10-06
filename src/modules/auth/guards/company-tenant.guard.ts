import {
    BadRequestException,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../dto/active-user.dto';

/**
 * Verifica que el :companyId de la URL pertenezca al tenant del usuario autenticado.
 * Evita que un usuario de un tenant consulte o modifique datos de empresas de otro tenant
 * cambiando el número en la URL.
 *
 * Uso (siempre DESPUÉS de JwtAuthGuard, que es quien llena request.user):
 *   @UseGuards(JwtAuthGuard, CompanyTenantGuard)
 *   @Controller('companies/:companyId/...')
 */
@Injectable()
export class CompanyTenantGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user: ActiveUserDto | undefined = request.user;
        const rawCompanyId = request.params?.companyId;

        // Rutas sin :companyId no aplican a este guard
        if (rawCompanyId === undefined) return true;

        const companyId = Number(rawCompanyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            throw new BadRequestException('El identificador de la empresa no es válido.');
        }

        if (!user?.idTenant) {
            throw new ForbiddenException('El usuario no tiene un tenant asignado.');
        }

        const company = await this.prisma.catEmpresas.findFirst({
            where: { idEmpresa: companyId, idTenant: user.idTenant },
            select: { idEmpresa: true },
        });

        if (!company) {
            throw new ForbiddenException('No tienes acceso a esta empresa.');
        }

        return true;
    }
}