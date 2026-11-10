import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NubariumService } from './services/nubarium.service';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';

jest.mock('../../prisma/prisma.service', () => {
  const mockQueryRaw = jest.fn();
  return {
    __esModule: true,
    PrismaService: jest.fn().mockImplementation(() => ({
      $queryRaw: mockQueryRaw,
    })),
    getMockQueryRaw: () => mockQueryRaw,
  };
});

jest.mock('./services/nubarium.service', () => ({
  NubariumService: jest.fn(),
}));

jest.mock('../notifications/notification.dispatcher', () => ({
  NotificationDispatcher: jest.fn(),
}));

import { DigitalFilesService } from './digital-files.service';
import { PrismaService } from '../../prisma/prisma.service';

function getMockQueryRaw(): jest.Mock {
  const { getMockQueryRaw } = jest.requireMock('../../prisma/prisma.service');
  return getMockQueryRaw();
}

describe('DigitalFilesService - getCompanyDocuments', () => {
  let service: DigitalFilesService;

  beforeEach(async () => {
    getMockQueryRaw().mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigitalFilesService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: getMockQueryRaw() },
        },
        {
          provide: JwtService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: NubariumService,
          useValue: {},
        },
        {
          provide: NotificationDispatcher,
          useValue: { notify: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DigitalFilesService>(DigitalFilesService);
  });

  it('should return company documents AND contract when both exist', async () => {
    const employeeId = 42;

    getMockQueryRaw()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          idContrato: 100,
          idDocumentoGenerado: 200,
          rutaOriginal: null,
          firmado: false,
          fechaGeneracion: new Date('2025-06-01T10:00:00Z'),
          codigoValidacion: null,
          hash: null,
          rutaConstancia: null,
          fechaObtencion: null,
        },
      ]);

    const result = await service.getCompanyDocuments(employeeId);

    expect(result.documentos).toHaveLength(1);
    expect(result.documentos[0]).toMatchObject({
      id: -100,
      nombre: 'Contrato Laboral',
      firmado: false,
      requereFirma: true,
      rutaFirmado: null,
    });
    expect(result.documentos[0].nom151.certificado).toBe(false);
    expect(result.documentos[0].nom151.codigoValidacion).toBeNull();
  });

  it('should include NOM-151 certificate data when present', async () => {
    const employeeId = 42;

    getMockQueryRaw()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          idContrato: 100,
          idDocumentoGenerado: 200,
          rutaOriginal: 'media/documentos-generados/abc.pdf',
          firmado: true,
          fechaGeneracion: new Date('2025-06-01T10:00:00Z'),
          codigoValidacion: 'NOM151-ABC123',
          hash: 'abc123hash',
          rutaConstancia: 'media/documentos-generados/nom151/abc.cer',
          fechaObtencion: new Date('2025-06-01T12:00:00Z'),
        },
      ]);

    const result = await service.getCompanyDocuments(employeeId);

    expect(result.documentos).toHaveLength(1);
    const doc = result.documentos[0];
    expect(doc.nom151.certificado).toBe(true);
    expect(doc.nom151.codigoValidacion).toBe('NOM151-ABC123');
    expect(doc.nom151.hash).toBe('abc123hash');
    expect(doc.nom151.urlConstancia).toBe('documentos-generados/nom151/abc_constancia.pdf');
    expect(doc.nom151.estatus).toBe('COMPLETADO');
    expect(doc.nom151.fechaObtencion).toBeTruthy();
    expect(doc.firmado).toBe(true);
    expect(doc.ruta).toBe('documentos-generados/abc.pdf');
  });

  it('should merge contracts with existing company documents', async () => {
    const employeeId = 42;

    getMockQueryRaw()
      .mockResolvedValueOnce([
        {
          idDocumentoEmpresa: 5,
          nombre: 'Reglamento Interno',
          rutaOriginal: 'media/empresa/reglamento.pdf',
          rutaFirmado: null,
          fechaEnvio: new Date('2025-05-01T10:00:00Z'),
          fechaFirmado: null,
          codigoValidacion: null,
          hash: null,
          rutaConstancia: null,
          estatusNOM151: null,
          claveMensaje: null,
          fechaObtencion: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          idContrato: 100,
          idDocumentoGenerado: 200,
          rutaOriginal: 'media/documentos-generados/contrato.pdf',
          firmado: true,
          fechaGeneracion: new Date('2025-06-01T10:00:00Z'),
          codigoValidacion: 'NOM151-XYZ',
          hash: 'xyzhash',
          rutaConstancia: null,
          fechaObtencion: new Date('2025-06-01T12:00:00Z'),
        },
      ]);

    const result = await service.getCompanyDocuments(employeeId);

    expect(result.documentos).toHaveLength(2);
    expect(result.documentos[0].nombre).toBe('Contrato Laboral');
    expect(result.documentos[0].id).toBe(-100);
    expect(result.documentos[1].nombre).toBe('Reglamento Interno');
    expect(result.documentos[1].id).toBe(5);
  });

  it('should not include contract when no DocumentosGenerados linked', async () => {
    const employeeId = 42;

    getMockQueryRaw()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.getCompanyDocuments(employeeId);

    expect(result.documentos).toHaveLength(0);
  });

  it('should handle null fechaObtencion gracefully', async () => {
    const employeeId = 42;

    getMockQueryRaw()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          idContrato: 100,
          idDocumentoGenerado: 200,
          rutaOriginal: 'media/doc.pdf',
          firmado: false,
          fechaGeneracion: null,
          codigoValidacion: null,
          hash: null,
          rutaConstancia: null,
          fechaObtencion: null,
        },
      ]);

    const result = await service.getCompanyDocuments(employeeId);

    expect(result.documentos[0].nom151.fechaObtencion).toBeNull();
    expect(result.documentos[0].nom151.certificado).toBe(false);
  });

  it('should keep PDF constancia path unchanged (new format)', async () => {
    const employeeId = 42;

    getMockQueryRaw()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          idContrato: 100,
          idDocumentoGenerado: 200,
          rutaOriginal: 'media/documentos-generados/contrato.pdf',
          firmado: true,
          fechaGeneracion: new Date('2025-06-01T10:00:00Z'),
          codigoValidacion: 'NOM151-XYZ789',
          hash: 'xyzhash2',
          rutaConstancia: 'media/documentos-generados/nom151/xyz_constancia.pdf',
          fechaObtencion: new Date('2025-06-01T12:00:00Z'),
        },
      ]);

    const result = await service.getCompanyDocuments(employeeId);

    expect(result.documentos[0].nom151.urlConstancia).toBe('documentos-generados/nom151/xyz_constancia.pdf');
    expect(result.documentos[0].nom151.certificado).toBe(true);
  });
});
