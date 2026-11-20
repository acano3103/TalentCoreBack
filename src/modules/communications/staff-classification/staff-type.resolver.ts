import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Tipo de personal efectivo: el override del empleado gana;
 * si no hay override, se usa el del puesto. Sin puesto, null.
 */
@Injectable()
export class StaffTypeResolver {
    constructor(private readonly prisma: PrismaService) {}

    async forEmployee(idEmpleado: number): Promise<number | null> {
        const empleado = await this.prisma.empleados.findUnique({
            where: { idEmpleado },
            select: {
                idTipoPersonalOverride: true,
                CatPuestos: { select: { idTipoPersonal: true } },
            },
        });
        if (!empleado) return null;
        return empleado.idTipoPersonalOverride ?? empleado.CatPuestos?.idTipoPersonal ?? null;
    }
}
