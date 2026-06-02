import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) { }

  /** Returns all active roles from catroles table */
  async findAllRoles() {
    return this.prisma.catroles.findMany({
      where: { activo: true },
      orderBy: { idRol: 'asc' },
      select: {
        idRol: true,
        descripcion: true,
        activo: true,
      },
    });
  }
}
