import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersQueries } from './queries/users.queries';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async getUserFullInfo(userId: number) {
    const [username, roles, enterprises, modules, sites] = await Promise.all([
      UsersQueries.getUsername(this.prisma, userId),
      UsersQueries.getRoles(this.prisma, userId),
      UsersQueries.getEnterprises(this.prisma, userId),
      UsersQueries.getModules(this.prisma, userId),
      UsersQueries.getSites(this.prisma, userId),
    ]);

    return {
      id: userId,
      username: username?.[0]?.username ?? null,
      roles: roles.map(r => r.descripcion),
      enterprises: enterprises.map(e => ({
        id: e.idEmpresa,
        name: e.nombre_comercial,
      })),
      modules: modules.map(m => m.Descripcion),
      sites: sites.map(s => ({
        id: s.idSite,
        name: s.Descripcion,
      })),
    };
  }
}
