import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * El payload de Artemis/IVR no trae tenant. Hoy solo hay un tenant en
 * producción; este helper acredita la checada a ese único tenant activo.
 *
 * TODO(artemis): pedir a Artemis que envíe idEmpresa o idTenant en el
 * payload del clock-in. Mientras haya un solo tenant esto es seguro; en
 * cuanto entre el segundo, este bloque tiene que fallar ruidosamente.
 */
export async function resolverTenantUnico(
  prisma: PrismaService,
): Promise<number> {
  const tenantsActivos = await prisma.catTenants.findMany({
    where: { activo: true },
    select: { idTenant: true },
  });

  if (tenantsActivos.length > 1) {
    throw new ConflictException(
      'Hay más de un tenant activo y el payload de Artemis no identifica ' +
        'a cuál pertenece la checada. Se requiere el campo idTenant o idEmpresa.',
    );
  }

  const idTenant = tenantsActivos[0]?.idTenant;
  if (idTenant == null) {
    throw new NotFoundException(
      'No hay un tenant activo para acreditar la checada.',
    );
  }

  return idTenant;
}
