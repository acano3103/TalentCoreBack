import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { MediaPathService } from 'src/common/services/media-path.service';
import { HechoCurso } from 'src/common/events/comms-hechos';
import { sumar } from 'src/common/utils/dias-habiles';
import { ConfigurationService } from 'src/modules/configuration/configuration.service';
import { trainingConfigPorDefecto } from 'src/modules/configuration/training-config';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { PrismaService } from 'src/prisma/prisma.service';
import { diaPrisma } from '../engine/impacto';
import { ComplianceService } from './compliance.service';

const usuario = {
  id: 1,
  uuid: 'rh-1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  idTenant: 2,
} as ActiveUserDto;

describe('ComplianceService', () => {
  it('un curso no normativo no crea constancia', async () => {
    const prisma = base();
    prisma.cursoParticipantes.findFirst.mockResolvedValue(
      participante(false, null),
    );
    const servicio = crear(prisma);

    await servicio.onCurso(aprobado());

    expect(prisma.cursoConstanciaDc3.create).not.toHaveBeenCalled();
  });

  it('al aprobar un curso normativo fija el límite a 20 días hábiles', async () => {
    const prisma = base();
    prisma.cursoParticipantes.findFirst.mockResolvedValue(
      participante(true, new Date('2026-12-18T18:00:00.000Z')),
    );
    prisma.cursoConstanciaDc3.findUnique.mockResolvedValue(null);
    prisma.cursoConstanciaDc3.create.mockResolvedValue({ idConstancia: 8 });
    prisma.catSites.findFirst.mockResolvedValue({
      zonaHoraria: 'America/Mexico_City',
    });
    const config = {
      getTrainingConfig: jest.fn().mockResolvedValue({
        ...trainingConfigPorDefecto('Acme'),
        dc3AutoGenerar: false,
      }),
    };
    const servicio = crear(prisma, config);

    await servicio.onCurso(aprobado());

    const data = prisma.cursoConstanciaDc3.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      idCurso: 9,
      idEmpleado: 7,
      estatus: 'pendiente',
    });
    expect(data.fechaTerminoCurso).toEqual(diaPrisma('2026-12-18'));
    expect(data.fechaLimiteEntrega).toEqual(diaPrisma('2027-01-19'));
  });

  it('la generación con un dato faltante responde 422 con la lista', async () => {
    const prisma = base();
    permitir(prisma);
    prisma.cursoConstanciaDc3.findMany.mockResolvedValue([constancia()]);
    sembrarFicha(prisma, { curp: null });
    const servicio = crear(prisma);

    await expect(servicio.generarDc3(usuario, 1, [8])).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    try {
      await servicio.generarDc3(usuario, 1, [8]);
    } catch (error) {
      const cuerpo = (error as HttpException).getResponse() as {
        code: string;
        detail: { faltantes: { nombre: string; campos: string[] }[] };
      };
      expect(cuerpo.code).toBe('DATOS_INCOMPLETOS');
      expect(cuerpo.detail.faltantes).toEqual([
        expect.objectContaining({
          idConstancia: 8,
          nombre: 'Ana López',
          campos: ['CURP'],
        }),
      ]);
    }
    expect(prisma.cursoConstanciaDc3.update).not.toHaveBeenCalled();
  });

  it('genera el PDF cuando los datos del formato están completos', async () => {
    const prisma = base();
    permitir(prisma);
    prisma.cursoConstanciaDc3.findMany.mockResolvedValue([constancia()]);
    prisma.cursoConstanciaDc3.update.mockResolvedValue({});
    prisma.historicoMovimientos.create.mockResolvedValue({});
    sembrarFicha(prisma, { curp: 'LOPE800101MDFLRR01' });
    const media = {
      saveGeneratedFile: jest.fn().mockResolvedValue({
        rutaRelativa: '/media/2/constancias/dc3/dc3-8.pdf',
      }),
    };
    const servicio = crear(prisma, undefined, media);

    const resultado = await servicio.generarDc3(usuario, 1, [8]);

    expect(media.saveGeneratedFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
    const actualizada = prisma.cursoConstanciaDc3.update.mock.calls[0][0];
    expect(actualizada.where.idConstancia).toBe(8);
    expect(actualizada.data.estatus).toBe('generada');
    expect(actualizada.data.archivo).toBe('/media/2/constancias/dc3/dc3-8.pdf');
    expect(resultado.generadas).toBe(1);
  });

  it('avisa a RH cuando faltan 5 días hábiles para entregar la DC-3', async () => {
    const prisma = base();
    const limite = sumar('2026-11-26', 5);
    prisma.catEmpresas.findMany.mockResolvedValue([
      { idEmpresa: 1, idTenant: 2 },
    ]);
    prisma.catSites.findFirst.mockResolvedValue({
      zonaHoraria: 'America/Mexico_City',
    });
    prisma.cursoConstanciaDc3.findMany.mockResolvedValue([
      {
        idConstancia: 8,
        fechaLimiteEntrega: diaPrisma(limite),
        fechaTerminoCurso: diaPrisma('2025-01-01'),
        estatus: 'pendiente',
        Empleados: { idSite: 3 },
      },
    ]);
    prisma.reporteDc4.findMany.mockResolvedValue([]);
    prisma.comRecordatoriosEnviados.findMany.mockResolvedValue([]);
    prisma.comRecordatoriosEnviados.createMany.mockResolvedValue({ count: 1 });
    prisma.catRoles.findMany.mockResolvedValue([{ idRol: 4 }]);
    prisma.relRolPermisos.findMany.mockResolvedValue([{ idRol: 4 }]);
    prisma.relUsuarioRol.findMany.mockResolvedValue([{ idUsuario: 1 }]);
    prisma.auth_user.findMany.mockResolvedValue([{ uuid: 'rh-1' }]);
    prisma.empleados.findMany.mockResolvedValue([
      { idEmpleado: 15, idUsuario: 'rh-1' },
    ]);
    const avisos = { dispatchComms: jest.fn().mockResolvedValue({}) };
    const servicio = crear(prisma, undefined, undefined, avisos);

    await servicio.avisarPlazos(new Date('2026-11-26T18:00:00.000Z'));

    expect(avisos.dispatchComms).toHaveBeenCalledWith(
      { userUuid: 'rh-1' },
      expect.objectContaining({
        titulo: 'Constancias DC-3 por entregar',
        categoria: 'RECORDATORIO',
        idEmpresa: 1,
      }),
      [{ codigo: 'SOCKETS', enviarAhora: true }],
    );
    expect(prisma.comRecordatoriosEnviados.createMany).toHaveBeenCalled();
  });
});

function crear(
  prisma: ReturnType<typeof base>,
  config?: { getTrainingConfig: jest.Mock },
  media?: { saveGeneratedFile: jest.Mock },
  avisos?: { dispatchComms: jest.Mock },
) {
  return new ComplianceService(
    prisma as unknown as PrismaService,
    (config ?? {
      getTrainingConfig: jest
        .fn()
        .mockResolvedValue(trainingConfigPorDefecto('Acme')),
    }) as unknown as ConfigurationService,
    { generate: jest.fn() } as unknown as ExcelExportService,
    (media ?? {
      saveGeneratedFile: jest.fn(),
    }) as unknown as MediaPathService,
    (avisos ?? {
      dispatchComms: jest.fn(),
    }) as unknown as NotificationDispatcher,
  );
}

function base() {
  return {
    relUsuarioRol: { findMany: jest.fn() },
    relRolPermisos: { findFirst: jest.fn(), findMany: jest.fn() },
    cursoParticipantes: { findFirst: jest.fn(), findMany: jest.fn() },
    cursoConstanciaDc3: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn<
        Promise<{ idConstancia: number }>,
        [Prisma.CursoConstanciaDc3CreateArgs]
      >(),
      update: jest.fn<
        Promise<unknown>,
        [Prisma.CursoConstanciaDc3UpdateArgs]
      >(),
      updateMany: jest.fn(),
    },
    catSites: { findFirst: jest.fn(), findMany: jest.fn() },
    catEmpresas: { findFirst: jest.fn(), findMany: jest.fn() },
    catCursos: { findMany: jest.fn() },
    catRegistrosPatronales: { findMany: jest.fn() },
    empleados: { findMany: jest.fn() },
    historicoMovimientos: { create: jest.fn() },
    reporteDc4: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    comRecordatoriosEnviados: { findMany: jest.fn(), createMany: jest.fn() },
    catRoles: { findMany: jest.fn() },
    auth_user: { findMany: jest.fn() },
  };
}

function permitir(prisma: ReturnType<typeof base>) {
  prisma.relUsuarioRol.findMany.mockResolvedValue([{ idRol: 4 }]);
  prisma.relRolPermisos.findFirst.mockResolvedValue({ id: 1 });
}

function aprobado(): HechoCurso {
  return {
    tipo: 'APROBADO',
    idTenant: 2,
    idEmpresa: 1,
    idEmpleado: 7,
    idSesion: 4,
    curso: 'Seguridad',
  };
}

function participante(normativo: boolean, conclusion: Date | null) {
  return {
    idParticipante: 3,
    CursoSeguimientoParticipante: conclusion
      ? { fechaConclusion: conclusion }
      : null,
    CursoSesiones: {
      idEmpresa: 1,
      CatCursos: { idCursos: 9, esNormativoStps: normativo },
    },
  };
}

function constancia() {
  return {
    idConstancia: 8,
    idTenant: 2,
    idEmpresa: 1,
    idParticipante: 3,
    idEmpleado: 7,
    idCurso: 9,
    fechaTerminoCurso: diaPrisma('2026-12-18'),
    fechaLimiteEntrega: diaPrisma('2027-01-19'),
    estatus: 'pendiente',
    fechaGenerada: null,
    fechaEntregada: null,
    archivo: null,
  };
}

function sembrarFicha(
  prisma: ReturnType<typeof base>,
  persona: { curp: string | null },
) {
  prisma.empleados.findMany.mockResolvedValue([
    {
      idEmpleado: 7,
      nombre: 'Ana',
      primerApellido: 'López',
      segundoApellido: null,
      curp: persona.curp,
      idSite: 3,
      CatPuestos: { NombrePuesto: 'Operadora' },
    },
  ]);
  prisma.catCursos.findMany.mockResolvedValue([
    {
      idCursos: 9,
      Descripcion: 'Seguridad',
      duracionHoras: 8,
      areaTematicaStps: '3000',
    },
  ]);
  prisma.cursoParticipantes.findMany.mockResolvedValue([
    {
      idParticipante: 3,
      CursoSesiones: {
        fechaInicioPeriodo: new Date('2026-12-01T15:00:00.000Z'),
        fechaFinPeriodo: new Date('2026-12-18T18:00:00.000Z'),
      },
    },
  ]);
  prisma.catEmpresas.findFirst.mockResolvedValue({
    idEmpresa: 1,
    idTenant: 2,
    razon_social: 'Acme',
    rfc: 'ACM010101AAA',
  });
  prisma.catSites.findFirst.mockResolvedValue({
    zonaHoraria: 'America/Mexico_City',
  });
  prisma.catSites.findMany.mockResolvedValue([
    { idSite: 3, idRegistroPatronal: 5 },
  ]);
  prisma.catRegistrosPatronales.findMany.mockResolvedValue([
    { idRegistroPatronal: 5, RegistroPatronal: 'Y1234567890' },
  ]);
}
