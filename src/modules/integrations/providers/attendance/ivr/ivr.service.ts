import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { VerifyEmployeeIvrDto } from './dto/verify-employee-ivr.dto';

@Injectable()
export class IvrService {
    private readonly logger = new Logger(IvrService.name);

    constructor(private readonly prisma: PrismaService) { }

    async verifyEmployee(dto: VerifyEmployeeIvrDto) {
        if (!dto.employeeNumber.trim()) throw new BadRequestException('El número de empleado no es válido');

        const employee = await this.prisma.empleados.findFirst({
            where: {
                numeroEmpleado: dto.employeeNumber,
                activo: true,
            }
        })
        if (!employee) throw new BadRequestException(`No se encontró un empleado activo con el número ${dto.employeeNumber}`);

        const fullName = `${employee.nombre ?? ''} ${employee.primerApellido ?? ''} ${employee.segundoApellido ?? ''}`.trim();

        return {
            employeeId: employee.idEmpleado,
            fullName,
            birthDate: employee.fechaNacimiento,
            activeDids: ["5586820555", "5586820554", "5510110814", "4777148724"]
        }
    }

}
