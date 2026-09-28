jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { AttendanceService } from './attendance.service';
import { AttendanceTrackingConfigService } from '../config/attendance-config/attendance-config.service';
import { DEFAULT_ATTENDANCE_CONFIG } from '../config/attendance-config/interfaces/attendance-config.interface';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { mapJornadaConMarcajes } from './utils/jornada-response.util';

describe('AttendanceService.getUserAttendance', () => {
  it('reusa el helper compartido para cada jornada', async () => {
    const jornada = {
      idJornada: 3,
      fecha: new Date('2026-09-21T00:00:00.000Z'),
      estatusJornada: 'ABIERTA',
      minutosTrabajados: 120,
      minutosRetardo: 0,
      horaEntradaTeorica: new Date('1970-01-01T08:00:00.000Z'),
      horaSalidaTeorica: new Date('1970-01-01T17:00:00.000Z'),
      horaEntradaReal: new Date('2026-09-21T14:00:00.000Z'),
      horaSalidaReal: null,
      RegistrosAsistencia: [
        {
          idRegistro: 1,
          tipo: 'ENTRADA',
          canal: 'APP_MOVIL',
          fechaHoraRegistro: new Date('2026-09-21T14:00:00.000Z'),
          resultadoGeocerca: 'DENTRO',
          nombreDispositivo: 'Pixel',
        },
      ],
    };

    const prisma = {
      empleados: {
        findFirst: jest.fn(async () => ({
          idEmpleado: 42,
          numeroEmpleado: 'E-100',
          nombre: 'Ana',
          primerApellido: 'López',
          segundoApellido: null,
          idPuesto: 1,
          curp: null,
        })),
      },
      jornadasEmpleado: {
        findMany: jest.fn(async () => [jornada]),
      },
    };
    const config = {
      getConfiguracionAsistencia: jest.fn(async () => DEFAULT_ATTENDANCE_CONFIG),
    };

    const service = new AttendanceService(
      prisma as unknown as PrismaService,
      config as unknown as AttendanceTrackingConfigService,
    );

    const user = { idTenant: 3 } as ActiveUserDto;
    const result = await service.getUserAttendance(user, 9, 42);

    expect(result.jornadas).toEqual([mapJornadaConMarcajes(jornada)]);
    expect(prisma.jornadasEmpleado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idEmpleado: 42, idTenant: 3, idEmpresa: 9 },
      }),
    );
  });
});
