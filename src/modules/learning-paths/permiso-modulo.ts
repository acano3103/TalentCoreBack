import { ForbiddenException } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';

export async function exigirModulo(
  prisma: PrismaService,
  user: ActiveUserDto,
  codigo: string,
  accion: 'ver' | 'editar',
): Promise<void> {
  if (!user?.id) {
    throw new ForbiddenException('No tienes permiso para esta operación.');
  }
  const roles = await prisma.relUsuarioRol.findMany({
    where: { idUsuario: user.id, activo: true },
    select: { idRol: true },
  });
  if (roles.length === 0) {
    throw new ForbiddenException('No tienes permiso para esta operación.');
  }
  const permiso = await prisma.relRolPermisos.findFirst({
    where: {
      idRol: { in: roles.map((rol) => rol.idRol) },
      activo: true,
      CatModulos: { Codigo: codigo },
      ...(accion === 'ver'
        ? { puedeVer: true }
        : { OR: [{ puedeCrear: true }, { puedeActualizar: true }] }),
    },
    select: { id: true },
  });
  if (!permiso) {
    throw new ForbiddenException('No tienes permiso para esta operación.');
  }
}
