import { Injectable } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class VacanciesService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findActiveVacancies() {
        return true;
    }

    async findAllRequisitions(companyId: number, page: number, search: string, limit: number, activeUser: ActiveUserDto) {
        const user = await this.prisma.relUsuarioRol.findFirst({
            where: {
                idUsuario: activeUser.id
            }
        })
    }

    async createRequisition() {

    }

    async updateRequisition() {

    }

    async changeStatus() {

    }
}
