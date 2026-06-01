import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../src/users/users.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { DjangoPasswordHasher } from 'src/common/utils/django-password.util';

// ─── Module mocks (hoisted by Jest — prevent loading real implementations) ───

jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

jest.mock('src/common/utils/django-password.util', () => ({
  DjangoPasswordHasher: {
    hash: jest.fn().mockReturnValue('pbkdf2$hashed_password'),
  },

}));

jest.mock('./queries/users.queries', () => ({
  UsersQueries: {
    getUsername:   jest.fn().mockResolvedValue([{ username: 'test_user' }]),
    getRoles:      jest.fn().mockResolvedValue([]),
    getEnterprises: jest.fn().mockResolvedValue([]),
    getModules:    jest.fn().mockResolvedValue([]),
    getSites:      jest.fn().mockResolvedValue([]),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser = {
  id: 1,
  uuid: 'abc-123',
  username: 'test_user',
  first_name: 'Test',
  last_name: 'User',
  email: 'test@test.com',
  phone: '5551234567',
  is_superuser: false,
  is_staff: false,
  is_active: true,
  last_login: null,
  date_joined: new Date('2024-01-01'),
  idRol: 2,
  rol_descripcion: 'ANALISTA',
};

const createDto = {
  username: 'nuevo_user',
  first_name: 'Nuevo',
  last_name: 'Usuario',
  email: 'nuevo@test.com',
  password: 'MiPassword123',
  is_active: true,
  idRol: 2,
};

// ─── Mock PrismaService ───────────────────────────────────────────────────────

const mockPrisma = {
  $queryRaw:    jest.fn(),
  $transaction: jest.fn(),
  auth_user: {
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
  },
  relUsuarioRol: {
    create:     jest.fn(),
    updateMany: jest.fn(),
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all users with rol_descripcion', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([mockUser]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].rol_descripcion).toBe('ANALISTA');
      expect(result[0].id).toBe(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no users', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result).toEqual([]);
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns user with role when found', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([mockUser]);

      const result = await service.findOne(1);

      expect(result).toEqual(mockUser);
      expect(result?.idRol).toBe(2);
    });

    it('returns null when user does not exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.findOne(999);

      expect(result).toBeNull();
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates user + role in a single transaction', async () => {
      mockPrisma.auth_user.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          auth_user:     { create: jest.fn().mockResolvedValue({ id: 1 }) },
          relUsuarioRol: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });
      mockPrisma.$queryRaw.mockResolvedValue([mockUser]);

      const result = await service.create(createDto);

      expect(result).toEqual(mockUser);
      expect(DjangoPasswordHasher.hash).toHaveBeenCalledWith(createDto.password);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException if username already taken', async () => {
      mockPrisma.auth_user.findUnique.mockResolvedValue({ id: 5 });

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rolls back if relUsuarioRol insert fails', async () => {
      mockPrisma.auth_user.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockRejectedValue(new Error('DB error'));

      await expect(service.create(createDto)).rejects.toThrow('DB error');
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    const updateDto = { first_name: 'NuevoNombre', idRol: 3 };

    it('updates user fields and role atomically', async () => {
      mockPrisma.auth_user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          auth_user:     { update: jest.fn().mockResolvedValue({}) },
          relUsuarioRol: {
            updateMany: jest.fn().mockResolvedValue({}),
            create:     jest.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });
      const updatedUser = { ...mockUser, first_name: 'NuevoNombre', idRol: 3 };
      mockPrisma.$queryRaw.mockResolvedValue([updatedUser]);

      const result = await service.update(1, updateDto);

      expect(result.first_name).toBe('NuevoNombre');
      expect(result.idRol).toBe(3);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.auth_user.findUnique.mockResolvedValue(null);

      await expect(service.update(999, updateDto)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── deactivate ────────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('sets is_active = false (soft-delete)', async () => {
      mockPrisma.auth_user.findUnique.mockResolvedValue({ id: 1, is_active: true });
      mockPrisma.auth_user.update.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([{ ...mockUser, is_active: false }]);

      const result = await service.deactivate(1);

      expect(result.is_active).toBe(false);
      expect(mockPrisma.auth_user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data:  { is_active: false },
      });
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.auth_user.findUnique.mockResolvedValue(null);

      await expect(service.deactivate(999)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.auth_user.update).not.toHaveBeenCalled();
    });
  });
});
