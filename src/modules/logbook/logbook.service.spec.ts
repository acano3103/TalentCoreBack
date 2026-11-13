jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { LogbookService } from './logbook.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

describe('LogbookService.findAll evidencias', () => {
  const previa = process.env.MEDIA_PUBLIC_URL_BASE;

  afterEach(() => {
    if (previa === undefined) delete process.env.MEDIA_PUBLIC_URL_BASE;
    else process.env.MEDIA_PUBLIC_URL_BASE = previa;
  });

  it('resuelve urlFoto nulo con una sola consulta de evidencias para la página', async () => {
    delete process.env.MEDIA_PUBLIC_URL_BASE;

    const empleado = {
      idEmpleado: 10,
      numeroEmpleado: '100',
      nombre: 'Ana',
      primerApellido: 'Ruiz',
      segundoApellido: null,
    };
    const base = {
      idEmpleado: 10,
      fechaHoraRegistro: new Date('2026-11-11T14:10:00.000Z'),
      tipo: 'ENTRADA',
      latitud: null,
      longitud: null,
      idSitioDetectado: null,
      nombreDispositivo: null,
      resultadoGeocerca: 'NO_APLICA',
      esOffline: false,
      fechaHoraRecepcion: new Date('2026-11-11T14:10:05.000Z'),
      estatusProcesamiento: 'PROCESADO',
      KioscosAsistencia: null,
      requiereRevision: false,
      banderasRevision: null,
      Empleados: empleado,
    };

    const registros = [
      {
        ...base,
        idRegistro: 1,
        canal: 'APP_MOVIL',
        urlFoto: null,
        idEvidencia: 5,
      },
      {
        ...base,
        idRegistro: 2,
        canal: 'KIOSCO',
        urlFoto: null,
        idEvidencia: 8,
      },
      {
        ...base,
        idRegistro: 3,
        canal: 'BIOMETRICO',
        urlFoto: 'https://artemis.example/foto.jpg',
        idEvidencia: null,
      },
    ];

    const prisma = {
      registrosAsistencia: {
        count: jest.fn(async () => registros.length),
        findMany: jest.fn(async () => registros),
      },
      asistenciaEvidencias: {
        findMany: jest.fn(async () => [
          {
            idEvidencia: 5,
            rutaArchivo: '/media/acme/attendance/1/2026/11/a.jpg',
          },
          {
            idEvidencia: 8,
            rutaArchivo: 'media/attendance/kiosk/9/2026/11/b.jpg',
          },
        ]),
      },
    };

    const service = new LogbookService(
      prisma as unknown as PrismaService,
      { generate: jest.fn() } as unknown as ExcelExportService,
    );

    const pagina = await service.findAll(
      { idTenant: 3 } as ActiveUserDto,
      9,
      1,
      10,
    );

    expect(prisma.asistenciaEvidencias.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.asistenciaEvidencias.findMany).toHaveBeenCalledWith({
      where: { idEvidencia: { in: [5, 8] } },
      select: { idEvidencia: true, rutaArchivo: true },
    });
    expect(pagina.data.map((fila) => fila.evidencia)).toEqual([
      {
        tieneFoto: true,
        urlFoto: '/api/proxy-v2/media/acme/attendance/1/2026/11/a.jpg',
      },
      {
        tieneFoto: true,
        urlFoto: '/api/proxy-v2/media/attendance/kiosk/9/2026/11/b.jpg',
      },
      {
        tieneFoto: true,
        urlFoto: 'https://artemis.example/foto.jpg',
      },
    ]);
  });
});
