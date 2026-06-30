import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

    async findAllowedPositions(companyId: number, activeUser: ActiveUserDto) {
        const userAuth = await this.prisma.auth_user.findUnique({
            where: {
                id: activeUser.id
            },
            include: {
                Empleados: {
                    where: {
                        idEmpresa: companyId,
                        activo: true
                    }
                }
            }
        });

        if (!userAuth) throw new NotFoundException('Usuario de autenticación no encontrado.');

        const empleado = userAuth.Empleados?.[0];
        if (!empleado || !empleado.idPuesto) {
            throw new ForbiddenException('El usuario actual no tiene un perfil de empleado activo asignado.');
        }

        const idPuestoDelJefe = empleado.idPuesto;

        // Traemos TODOS los puestos activos de la empresa para procesar la jerarquía en memoria
        const allPositions = await this.prisma.catPuestos.findMany({
            where: {
                idEmpresa: companyId,
                Activo: true
            },
            select: {
                idPuesto: true,
                NombrePuesto: true,
                DescripcionPuesto: true,
                idJefeInmediato: true
            }
        });

        // Función recursiva interna para recolectar todos los puestos descendientes
        const allowedPositions: typeof allPositions = [];

        const getDescendants = (parentId: number) => {
            const children = allPositions.filter(pos => pos.idJefeInmediato === parentId);

            for (const child of children) {
                allowedPositions.push(child);
                getDescendants(child.idPuesto);
            }
        };

        // Ejecutamos la recursión partiendo desde el puesto del usuario logueado
        getDescendants(idPuestoDelJefe);
        allowedPositions.sort((a, b) => a.NombrePuesto.localeCompare(b.NombrePuesto));

        return allowedPositions;
    }

    async findAllowedLocations(companyId: number, activeUser: ActiveUserDto) {
        const userSites = await this.prisma.relUsuarioSite.findMany({
            where: {
                idUsuario: activeUser.id,
                activo: true,
                CatSites: {
                    idEmpresa: companyId,
                    Activo: true
                }
            },
            select: {
                CatSites: {
                    select: {
                        idSite: true,
                        Descripcion: true,
                        EsPrincipal: true
                    }
                }
            },
            orderBy: {
                CatSites: {
                    Descripcion: 'asc'
                }
            }
        });

        return userSites
            .filter(us => us.CatSites !== null)
            .map(us => ({
                idSite: us.CatSites!.idSite,
                Descripcion: us.CatSites!.Descripcion,
                EsPrincipal: us.CatSites!.EsPrincipal
            }));
    }

    async createRequisition() {

    }

    async updateRequisition() {

    }

    async changeStatus() {

    }
}
