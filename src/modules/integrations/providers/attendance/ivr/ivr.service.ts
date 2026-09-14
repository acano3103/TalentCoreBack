import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { VerifyEmployeeIvrDto } from './dto/verify-employee-ivr.dto';

@Injectable()
export class IvrService {
    private readonly logger = new Logger(IvrService.name);

    constructor(private readonly prisma: PrismaService) { }

    async verifyEmployee(dto: VerifyEmployeeIvrDto) {
        const cleanEmployeeNumber = dto.employeeNumber ? String(dto.employeeNumber).trim() : '';
        if (!cleanEmployeeNumber) {
            throw new BadRequestException('El número de empleado no es válido');
        }

        const employee = await this.prisma.empleados.findFirst({
            where: {
                numeroEmpleado: cleanEmployeeNumber,
                activo: true,
            },
        });

        if (!employee) {
            throw new BadRequestException(`No se encontró un empleado activo con el número ${cleanEmployeeNumber}`);
        }

        const fullName = `${employee.nombre ?? ''} ${employee.primerApellido ?? ''} ${employee.segundoApellido ?? ''}`.trim();

        // Consulta de DIDs activos según sedes autorizadas para IVR y excepciones (bloqueados y extras)
        const activeDidsResult = await this.prisma.$queryRaw<{ Did: string }[]>`
            SELECT DISTINCT d.Did
            FROM (
                -- 1. DIDs de catálogo pertenecientes a las sedes asignadas con IVR
                SELECT sd.Did
                FROM RelEmpleadosSites res
                JOIN CatSites s ON s.idSite = res.idSite
                JOIN CatSitesDids sd ON sd.idSite = s.idSite AND sd.Activo = 1
                WHERE res.idEmpleado = ${employee.idEmpleado}
                  AND res.Activo = 1
                  AND (res.MetodoAsistencia = 'IVR' OR (res.MetodoAsistencia IS NULL AND s.TipoAsistencia = 'IVR'))

                UNION ALL

                -- 2. DIDs personalizados EXTRA asignados al colaborador
                SELECT exc.Did
                FROM RelEmpleadosDidsExcepciones exc
                WHERE exc.idEmpleado = ${employee.idEmpleado}
                  AND exc.TipoExcepcion = 'EXTRA'
                  AND exc.Activo = 1
            ) d
            -- Descartar DIDs explícitamente bloqueados
            WHERE d.Did NOT IN (
                SELECT exc_b.Did
                FROM RelEmpleadosDidsExcepciones exc_b
                WHERE exc_b.idEmpleado = ${employee.idEmpleado}
                  AND exc_b.TipoExcepcion = 'BLOQUEADO'
                  AND exc_b.Activo = 1
            )
            ORDER BY d.Did ASC;
        `;

        const activeDids = activeDidsResult.map((item) => item.Did);

        return {
            employeeNumber: employee.numeroEmpleado,
            fullName,
            birthDate: employee.fechaNacimiento,
            activeDids,
        };
    }
}