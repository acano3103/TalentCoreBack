import { Injectable, NotFoundException } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { VacanciesQueries } from './queries/vacancies.queries';

@Injectable()
export class VacanciesService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findActiveVacancies() {
        return true;
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
