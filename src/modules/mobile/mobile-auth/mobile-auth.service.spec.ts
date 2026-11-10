jest.mock('uuid', () => ({
  v4: jest.fn(() => 'session-uuid-1'),
}));

jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('src/common/utils/django-password.util', () => ({
  DjangoPasswordHasher: {
    verify: jest.fn(),
  },
}));

jest.mock('src/modules/auth/queries/auth.queries', () => ({
  AuthDataService: class AuthDataService {},
}));

jest.mock('src/modules/notifications/notification.dispatcher', () => ({
  NotificationDispatcher: class NotificationDispatcher {},
}));

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DjangoPasswordHasher } from 'src/common/utils/django-password.util';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CaptchaService } from 'src/modules/auth/providers/captcha.service';
import { AuthDataService } from 'src/modules/auth/queries/auth.queries';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { PrismaService } from 'src/prisma/prisma.service';
import { MobileAuthService } from './mobile-auth.service';

const MENSAJE_SIN_EMPLEADO =
  'Tu usuario no tiene un perfil de empleado activo. Contacta a Recursos Humanos.';

const userSystem = {
  id: 7,
  uuid: 'user-uuid',
  password: 'hash',
  is_active: true,
  is_superuser: false,
  email: 'ana@example.com',
  phone: '5555555555',
  first_name: 'Ana',
  last_name: 'Lopez',
  username: 'ana',
  idTenant: 3,
};

const empleadoActivo = {
  idEmpleado: 42,
  idEmpresa: 9,
  idTenant: 3,
  numeroEmpleado: 'E-100',
  nombre: 'Ana',
  primerApellido: 'Lopez',
  segundoApellido: 'Ruiz',
  idPuesto: 4,
  idSite: 8,
};

describe('MobileAuthService', () => {
  let service: MobileAuthService;
  let flags: Record<string, string>;
  let prisma: {
    empleados: { findFirst: jest.Mock };
    auth_user: { findUnique: jest.Mock };
    usuarioslogin: {
      findFirst: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    tokenUsuario: { create: jest.Mock; deleteMany: jest.Mock };
  };
  let dataService: { getUserSystem: jest.Mock; getStaffData: jest.Mock };
  let notifications: { notify: jest.Mock };
  let jwtService: { sign: jest.Mock };

  beforeEach(() => {
    flags = {
      MOBILE_USE_CAPTCHA: 'false',
      MOBILE_USE_TOKEN_2FA: 'false',
      MOBILE_ALLOW_CONCURRENT_SESSIONS: 'true',
    };

    prisma = {
      empleados: { findFirst: jest.fn() },
      auth_user: { findUnique: jest.fn() },
      usuarioslogin: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tokenUsuario: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    dataService = {
      getUserSystem: jest.fn().mockResolvedValue(userSystem),
      getStaffData: jest.fn().mockResolvedValue({
        id: userSystem.id,
        nombre: 'Ana Lopez',
        roles: ['EMPLEADO'],
        empresas: [],
        modulos: [],
      }),
    };

    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };
    (DjangoPasswordHasher.verify as jest.Mock).mockReturnValue(true);

    service = new MobileAuthService(
      prisma as unknown as PrismaService,
      { get: (key: string, defaultValue?: string) => flags[key] ?? defaultValue } as ConfigService,
      jwtService as unknown as JwtService,
      dataService as unknown as AuthDataService,
      notifications as unknown as NotificationDispatcher,
      { validateToken: jest.fn() } as unknown as CaptchaService,
    );
  });

  describe('login', () => {
    const loginDto = { username: 'ana', password: 'secreto' };

    it('incluye idEmpleado en el payload y conserva los claims previos', async () => {
      prisma.empleados.findFirst.mockResolvedValue(empleadoActivo);
      prisma.auth_user.findUnique.mockResolvedValue(userSystem);
      prisma.usuarioslogin.findFirst.mockResolvedValue({ identificador: 'sess-mobile-1' });

      const result = await service.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith({
        user_id: userSystem.id,
        roles: ['EMPLEADO'],
        session_id: 'sess-mobile-1',
        is_superuser: false,
        idTenant: 3,
        idEmpleado: 42,
        idEmpresa: 9,
        numeroEmpleado: 'E-100',
      });
      expect(result).toEqual(
        expect.objectContaining({
          token: 'jwt-token',
          user_type: 'staff',
          userData: expect.objectContaining({
            empleado: {
              nombreCompleto: 'Ana Lopez Ruiz',
              numeroEmpleado: 'E-100',
              idPuesto: 4,
              idSite: 8,
            },
          }),
        }),
      );
    });

    it('responde 401 si las credenciales son válidas pero no hay empleado activo', async () => {
      prisma.empleados.findFirst.mockResolvedValue(null);

      const error = await service.login(loginDto).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getStatus()).toBe(401);
      expect((error as UnauthorizedException).message).toBe(MENSAJE_SIN_EMPLEADO);
      expect(prisma.usuarioslogin.create).not.toHaveBeenCalled();
      expect(prisma.tokenUsuario.create).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('rechaza antes de enviar el código 2FA cuando no hay empleado activo', async () => {
      flags.MOBILE_USE_TOKEN_2FA = 'true';
      prisma.empleados.findFirst.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(MENSAJE_SIN_EMPLEADO);

      expect(notifications.notify).not.toHaveBeenCalled();
      expect(prisma.tokenUsuario.deleteMany).not.toHaveBeenCalled();
      expect(prisma.tokenUsuario.create).not.toHaveBeenCalled();
      expect(prisma.usuarioslogin.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('borra solo la sesión cuyo identificador llega en el token', async () => {
      const sesiones = [
        { identificador: 'sess-mobile-1', UuidUsuario: 'user-uuid' },
        { identificador: 'sess-web-9', UuidUsuario: 'user-uuid' },
      ];

      prisma.usuarioslogin.deleteMany.mockImplementation(async ({ where }) => {
        const antes = sesiones.length;
        for (let i = sesiones.length - 1; i >= 0; i--) {
          const coincideIdentificador =
            where.identificador == null || sesiones[i].identificador === where.identificador;
          const coincideUsuario =
            where.UuidUsuario == null || sesiones[i].UuidUsuario === where.UuidUsuario;
          if (coincideIdentificador && coincideUsuario) {
            sesiones.splice(i, 1);
          }
        }
        return { count: antes - sesiones.length };
      });

      const activeUser = {
        id: userSystem.id,
        uuid: userSystem.uuid,
        idTenant: userSystem.idTenant,
        username: userSystem.username,
        first_name: userSystem.first_name,
        last_name: userSystem.last_name,
      } as ActiveUserDto;

      await expect(service.logout(activeUser, 'sess-mobile-1')).resolves.toEqual({
        success: true,
        message: 'Sesión móvil eliminada correctamente.',
      });

      expect(sesiones).toEqual([
        { identificador: 'sess-web-9', UuidUsuario: 'user-uuid' },
      ]);
      expect(prisma.auth_user.findUnique).not.toHaveBeenCalled();
    });
  });
});
