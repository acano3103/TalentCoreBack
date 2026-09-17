import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@Injectable()
export class RolesService {
    constructor(private readonly prismaService: PrismaService) { }

    async findAll(user: ActiveUserDto) {
        return await this.prismaService.catRoles.findMany({
            where: {
                activo: true,
                idTenant: user.idTenant
            },
            include: {
                RelRolPermisos: {
                    where: {
                        activo: true,
                        idTenant: user.idTenant,
                        CatModulos: {
                            Activo: true,
                            idTenant: user.idTenant
                        }
                    },
                    include: {
                        CatModulos: true
                    }
                }
            }
        });
    }

    async findOne(user: ActiveUserDto, id: number) {
        return await this.prismaService.catRoles.findUnique({
            where: {
                idRol: id,
                idTenant: user.idTenant
            },
            include: {
                RelRolPermisos: {
                    where: {
                        activo: true,
                        idTenant: user.idTenant,
                        CatModulos: {
                            Activo: true,
                            idTenant: user.idTenant
                        }
                    },
                    include: {
                        CatModulos: true
                    }
                }
            }
        });
    }
}