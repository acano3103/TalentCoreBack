import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RolesService {
    constructor(private readonly prismaService: PrismaService) { }

    async findAll() {
        return await this.prismaService.catRoles.findMany({
            where: { activo: true },
            include: {
                RelRolPermisos: {
                    where: { activo: true },
                    include: {
                        CatModulos: true
                    }
                }
            }
        });
    }

    async findOne(id: number) {
        return await this.prismaService.catRoles.findUnique({
            where: { idRol: id },
            include: {
                RelRolPermisos: {
                    where: { activo: true },
                    include: {
                        CatModulos: true
                    }
                }
            }
        });
    }
}