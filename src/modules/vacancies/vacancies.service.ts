import { Injectable, NotFoundException } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { VacanciesQueries } from './queries/vacancies.queries';

@Injectable()
export class VacanciesService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findActiveVacancies(companyId: number, activeUser: ActiveUserDto) {
        let rbacFilter = '';
        const roles = activeUser?.roles || [];

        const authUser = await this.prisma.auth_user.findUnique({
            where: { id: activeUser.id },
            select: { uuid: true }
        });

        if (authUser?.uuid) {
            const empleado = await this.prisma.empleados.findFirst({
                where: { idUsuario: authUser.uuid }
            });

            let areaId: number | null | undefined = null;
            if (empleado?.idPuesto) {
                const puesto = await this.prisma.catPuestos.findUnique({ where: { idPuesto: empleado.idPuesto } });
                areaId = puesto?.idArea;
            }

            if (roles.includes('MANAGER') && areaId) {
                rbacFilter = `AND p.idArea = ${areaId}`;
            } else if (roles.includes('RECLUTADOR') && empleado?.idEmpleado) {
                rbacFilter = `AND v.idReclutadorAsignado = ${empleado.idEmpleado}`;
            }
        }

        const query = `
            SELECT v.*, p.NombrePuesto, s.Descripcion as siteName
            FROM Vacantes v
            JOIN CatPuestos p ON v.idPuesto = p.idPuesto
            LEFT JOIN CatSites s ON p.idSite = s.idSite
            WHERE v.idEmpresa = ${companyId} 
              AND v.idEstatus = 2
              ${rbacFilter}
        `;

        const vacancies = await this.prisma.$queryRawUnsafe(query);
        return {
            data: vacancies,
            total: Array.isArray(vacancies) ? vacancies.length : 0
        };
    }

    async findAllRequisitions(companyId: number, page: number, search: string, limit: number, activeUser: ActiveUserDto) {
        const userRole = await this.prisma.relUsuarioRol.findFirst({
            where: {
                idUsuario: activeUser.id
            }
        });

        if (!userRole) throw new NotFoundException('Usuario no encontrado');

        const skip = (page - 1) * limit;

        const requisitions = await VacanciesQueries.getPaginatedRequisitions(
            this.prisma,
            companyId,
            activeUser.id,
            userRole.idRol,
            skip,
            limit,
            search
        );

        const total = await VacanciesQueries.countRequisitions(
            this.prisma,
            companyId,
            activeUser.id,
            userRole.idRol,
            search
        );

        return {
            data: requisitions,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit)
        };
    }

    async createRequisition() {

    }

    async updateRequisition() {

    }

    async changeStatus() {

    }
}
