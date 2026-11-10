import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TenantRequestDto } from '../dto/tenant-request.dto';
import { LocationEmployeesRequestDto } from './dto/location-employees-request.dto';

@Injectable()
export class NfcService {
    private readonly logger = new Logger(NfcService.name)

    constructor(
        private prisma: PrismaService
    ) { }

    // Obtiene todos los empleados que tienen asistencia autorizada en esas sedes y que el metodo es nfc
    async getEmployeesByLocation(dto: LocationEmployeesRequestDto) {
        const { tenantId, locationId } = dto;

        if (!tenantId || tenantId <= 0) {
            throw new BadRequestException('A valid tenant ID is required.');
        }

        if (!locationId || locationId <= 0) {
            throw new BadRequestException('A valid location ID is required.');
        }

        // Verify that the location belongs to the requested tenant.
        const location = await this.prisma.catSites.findFirst({
            where: {
                idSite: locationId,
                idTenant: tenantId,
            },
            select: {
                idSite: true,
            },
        });

        if (!location) {
            throw new BadRequestException(
                'The specified location does not belong to the requested tenant.',
            );
        }

        // Retrieve active NFC attendance authorizations for the location.
        const assignments = await this.prisma.relEmpleadosSites.findMany({
            where: {
                idTenant: tenantId,
                idSite: locationId,
                Activo: true,
                MetodoAsistencia: {
                    in: ['NFC', 'CUALQUIERA'],
                },
            },
            select: {
                idEmpleado: true,
            },
        });

        // Return an empty result if no employees are authorized.
        if (assignments.length === 0) {
            return {
                tenantId,
                locationId,
                total: 0,
                employees: [],
            };
        }

        const employeeIds = [
            ...new Set(assignments.map((assignment) => assignment.idEmpleado)),
        ];

        // Retrieve only active employees belonging to the requested tenant.
        const employees = await this.prisma.empleados.findMany({
            where: {
                idEmpleado: {
                    in: employeeIds,
                },
                idTenant: tenantId,
                activo: true,
            },
            select: {
                idEmpleado: true,
                numeroEmpleado: true,
                nombre: true,
                primerApellido: true,
                segundoApellido: true,
                artemisUserId: true,
            },
            orderBy: {
                nombre: 'asc',
            },
        });

        this.logger.log(
            `Retrieved ${employees.length} authorized NFC employees for tenant ${tenantId} at location ${locationId}.`,
        );

        return {
            tenantId,
            locationId,
            total: employees.length,
            employees,
        };
    }
}
