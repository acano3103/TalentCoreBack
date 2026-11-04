jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { ConflictException, HttpException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { PermisoModuloDto, UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

describe('RolesService', () => {
    let service: RolesService;
    let logSpy: jest.SpyInstance<void, unknown[]>;
    let errorSpy: jest.SpyInstance<void, unknown[]>;

    const user = { id: 77, idTenant: 3 } as ActiveUserDto;

    const txMock = {
        catRoles: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        catModulos: {
            findMany: jest.fn(),
        },
        relRolPermisos: {
            findMany: jest.fn(),
            createMany: jest.fn(),
            upsert: jest.fn(),
            updateMany: jest.fn(),
        },
    };

    const prismaMock = {
        catRoles: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
        catModulos: {
            findMany: jest.fn(),
        },
        $transaction: jest.fn(),
    };

    const rolEncontrado = {
        idRol: 5,
        idTenant: 3,
        descripcion: 'Reclutador',
        activo: true,
        RelRolPermisos: [],
    };

    const permiso = (
        idModulo: number,
        flags: Partial<PermisoModuloDto> = {},
    ): PermisoModuloDto => ({
        idModulo,
        ver: true,
        crear: false,
        editar: false,
        eliminar: false,
        ...flags,
    });

    const dto = (permisos: PermisoModuloDto[], rol?: { descripcion: string }): UpdateRoleDto => ({
        ...(rol ? { rol } : {}),
        permisos,
    });

    const capturarError = async (promise: Promise<unknown>): Promise<HttpException> =>
        promise.then(
            () => {
                throw new Error('Se esperaba un error pero la promesa resolvio');
            },
            (error: unknown) => error as HttpException,
        );

    const resumenDelLog = (): Record<string, number> => {
        const mensaje = String(logSpy.mock.calls[0]?.[0]);
        return JSON.parse(mensaje.split('resumen=')[1]) as Record<string, number>;
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        prismaMock.$transaction.mockImplementation((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RolesService,
                { provide: PrismaService, useValue: prismaMock },
            ],
        }).compile();

        service = module.get(RolesService);
        logSpy = jest.spyOn((service as unknown as { logger: { log: (...args: unknown[]) => void } }).logger, 'log')
            .mockImplementation(() => undefined);
        errorSpy = jest.spyOn((service as unknown as { logger: { error: (...args: unknown[]) => void } }).logger, 'error')
            .mockImplementation(() => undefined);
    });

    describe('findOne (GET /roles/:id)', () => {
        it('devuelve 404 si el rol no existe o pertenece a otro tenant (nunca null con 200)', async () => {
            prismaMock.catRoles.findUnique.mockResolvedValue(null);

            const error = await capturarError(service.findOne(user, 999));

            expect(error).toBeInstanceOf(NotFoundException);
            expect(prismaMock.catRoles.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { idRol: 999, idTenant: 3 },
                }),
            );
        });

        it('solo incluye permisos activos del mismo tenant y modulos activos', async () => {
            prismaMock.catRoles.findUnique.mockResolvedValue(rolEncontrado);

            const resultado = await service.findOne(user, 5);

            expect(resultado).toEqual(rolEncontrado);
            const primeraLlamada = (prismaMock.catRoles.findUnique.mock.calls[0] as unknown[])[0] as {
                include: { RelRolPermisos: { where: unknown } };
            };
            expect(primeraLlamada.include.RelRolPermisos.where).toEqual({
                activo: true,
                idTenant: 3,
                CatModulos: { Activo: true, idTenant: 3 },
            });
        });
    });

    describe('create (POST /roles)', () => {
        const modulosActivos = [{ idModulo: 10 }, { idModulo: 11 }, { idModulo: 12 }];

        const rolEnTransaccion = {
            idRol: 501,
            idTenant: 3,
            descripcion: 'Nuevo rol',
            activo: true,
        };

        const rolCreado = {
            ...rolEnTransaccion,
            RelRolPermisos: [],
        };

        const dtoCreate = (descripcion: string, permisos: PermisoModuloDto[] = []): CreateRoleDto => ({
            rol: { descripcion },
            permisos,
        });

        const filasCreadas = (): {
            idRol: number;
            idModulo: number;
            idTenant: number;
            puedeVer: boolean;
            puedeCrear: boolean;
            puedeActualizar: boolean;
            puedeEliminar: boolean;
            activo: boolean;
        }[] => {
            const args = (txMock.relRolPermisos.createMany.mock.calls[0] as unknown[])[0] as {
                data: ReturnType<typeof filasCreadas>;
            };
            return args.data;
        };

        beforeEach(() => {
            txMock.catRoles.findMany.mockResolvedValue([]);
            txMock.catModulos.findMany.mockResolvedValue(modulosActivos);
            txMock.catRoles.create.mockResolvedValue(rolEnTransaccion);
            txMock.relRolPermisos.createMany.mockResolvedValue({ count: 3 });
            txMock.catRoles.findUnique.mockResolvedValue(rolCreado);
        });

        it('crea el rol activo, con una fila por cada modulo activo del tenant y una unica transaccion', async () => {
            const resultado = await service.create(
                user,
                dtoCreate('Nuevo rol', [permiso(10), permiso(11, { crear: true, editar: true })]),
            );

            expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
                maxWait: 15_000,
                timeout: 20_000,
            });
            expect(txMock.catRoles.create).toHaveBeenCalledWith({
                data: { idTenant: 3, descripcion: 'Nuevo rol', activo: true },
            });

            // Un solo createMany con una fila por modulo activo (3), con idTenant en cada una
            expect(txMock.relRolPermisos.createMany).toHaveBeenCalledTimes(1);
            expect(filasCreadas()).toEqual([
                {
                    idTenant: 3,
                    idRol: 501,
                    idModulo: 10,
                    puedeVer: true,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: true,
                },
                {
                    idTenant: 3,
                    idRol: 501,
                    idModulo: 11,
                    puedeVer: true,
                    puedeCrear: true,
                    puedeActualizar: true,
                    puedeEliminar: false,
                    activo: true,
                },
                {
                    idTenant: 3,
                    idRol: 501,
                    idModulo: 12,
                    puedeVer: false,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: true,
                },
            ]);

            // La respuesta tiene el mismo formato que GET /roles/:id
            const lectura = (txMock.catRoles.findUnique.mock.calls[0] as unknown[])[0] as {
                where: unknown;
                include: { RelRolPermisos: { where: unknown } };
            };
            expect(lectura.where).toEqual({ idRol: 501, idTenant: 3 });
            expect(lectura.include.RelRolPermisos.where).toEqual({
                activo: true,
                idTenant: 3,
                CatModulos: { Activo: true, idTenant: 3 },
            });
            expect(resultado).toEqual(rolCreado);

            // Un unico log despues del commit, con idRol, tenant, descripcion, usuario y accesos
            expect(logSpy).toHaveBeenCalledTimes(1);
            const mensaje = String(logSpy.mock.calls[0]?.[0]);
            expect(mensaje).toContain('idRol=501');
            expect(mensaje).toContain('tenant=3');
            expect(mensaje).toContain('descripcion=Nuevo rol');
            expect(mensaje).toContain('usuario=77');
            expect(mensaje).toContain('modulosConAcceso=2');
        });

        it('con permisos vacios crea todos los modulos con los cuatro permisos en false', async () => {
            const resultado = await service.create(user, dtoCreate('Solo lectura', []));

            expect(txMock.catRoles.create).toHaveBeenCalledTimes(1);
            expect(filasCreadas()).toHaveLength(3);
            expect(
                filasCreadas().every(
                    (fila) => !fila.puedeVer && !fila.puedeCrear && !fila.puedeActualizar && !fila.puedeEliminar,
                ),
            ).toBe(true);
            expect(resultado).toEqual(rolCreado);
            expect(String(logSpy.mock.calls[0]?.[0])).toContain('modulosConAcceso=0');
        });

        it('devuelve 409 si ya existe un rol con ese nombre en el tenant (case y espacios distintos), sin escribir nada', async () => {
            txMock.catRoles.findMany.mockResolvedValue([{ descripcion: '  admin  ' }, { descripcion: 'Otro' }]);

            const error = await capturarError(service.create(user, dtoCreate('Admin')));

            expect(error).toBeInstanceOf(ConflictException);
            expect(error.getResponse()).toEqual(
                expect.objectContaining({
                    message: 'Ya existe un rol con ese nombre en tu empresa.',
                    code: 'ROL_DUPLICADO',
                }),
            );
            expect(error.getStatus()).toBe(409);
            expect(txMock.catRoles.create).not.toHaveBeenCalled();
            expect(txMock.relRolPermisos.createMany).not.toHaveBeenCalled();
            expect(logSpy).not.toHaveBeenCalled();
        });

        it('devuelve 409 tambien si el rol existente esta inactivo (la lectura no filtra por activo)', async () => {
            // La consulta solo filtra por idTenant: una fila inactiva con el mismo
            // nombre tambien bloquea la creacion.
            txMock.catRoles.findMany.mockResolvedValue([{ descripcion: '  Admin ' }]);

            const error = await capturarError(service.create(user, dtoCreate('admin')));

            expect(error).toBeInstanceOf(ConflictException);
            expect(txMock.catRoles.create).not.toHaveBeenCalled();
        });

        it('devuelve 422 con idModulosRechazados si un idModulo no es modulo activo del tenant, sin crear el rol', async () => {
            txMock.catModulos.findMany.mockResolvedValue([{ idModulo: 10 }]);

            const error = await capturarError(
                service.create(user, dtoCreate('Nuevo rol', [permiso(10), permiso(999)])),
            );

            expect(error).toBeInstanceOf(UnprocessableEntityException);
            expect(error.getResponse()).toEqual(
                expect.objectContaining({
                    code: 'MODULOS_INVALIDOS',
                    detail: { idModulosRechazados: [999] },
                }),
            );
            expect(txMock.catRoles.create).not.toHaveBeenCalled();
            expect(txMock.relRolPermisos.createMany).not.toHaveBeenCalled();
            expect(logSpy).not.toHaveBeenCalled();
        });

        it('devuelve 422 con VER_REQUERIDO si crear/editar/eliminar vienen en true con ver en false', async () => {
            const error = await capturarError(
                service.create(user, dtoCreate('Nuevo rol', [permiso(10, { ver: false, crear: true })])),
            );

            expect(error).toBeInstanceOf(UnprocessableEntityException);
            expect(error.getResponse()).toEqual(
                expect.objectContaining({
                    code: 'VER_REQUERIDO',
                    detail: { idModulos: [10] },
                }),
            );
            expect(txMock.catRoles.create).not.toHaveBeenCalled();
            expect(logSpy).not.toHaveBeenCalled();
        });

        it('el tenant sale siempre del usuario autenticado, nunca del body', async () => {
            await service.create(user, dtoCreate('Otro tenant', [permiso(10)]));

            const argsCatalogo = (txMock.catModulos.findMany.mock.calls[0] as unknown[])[0] as {
                where: Record<string, unknown>;
            };
            expect(argsCatalogo.where).toEqual({ Activo: true, idTenant: 3 });
            expect(txMock.catRoles.create).toHaveBeenCalledWith({
                data: { idTenant: 3, descripcion: 'Otro tenant', activo: true },
            });
        });

        it('no registra auditoria si la transaccion falla y responde 500 generico con ERROR_CREAR_ROL', async () => {
            txMock.catRoles.create.mockRejectedValueOnce(
                new Error('Transaction API error ... C:\\Users\\dreyes\\Documents\\Talent\\TalentCoreBack\\roles.service.ts'),
            );

            const error = await capturarError(service.create(user, dtoCreate('Nuevo rol', [permiso(10)])));

            expect(error).toBeInstanceOf(HttpException);
            expect(error.getStatus()).toBe(500);
            const respuesta = error.getResponse() as { message: string; code: string; error: string };
            expect(respuesta.code).toBe('ERROR_CREAR_ROL');
            expect(respuesta.error).toBe('Internal Server Error');
            expect(respuesta.message).toBe('No se pudo crear el rol. Intenta de nuevo.');
            expect(respuesta.message).not.toContain('C:\\');

            expect(logSpy).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledTimes(1);
            expect(String(errorSpy.mock.calls[0]?.[0])).toContain('create | tenant=3 | usuario=77');
            expect(String(errorSpy.mock.calls[0]?.[0])).toContain('C:\\Users\\dreyes');
        });
    });

    describe('findModulos (GET /roles/modulos)', () => {
        const modulosDelTenant = [
            { idModulo: 10, Descripcion: 'Vacantes', Codigo: 'VAC', idPadre: null, Activo: true },
        ];

        it('devuelve solo los modulos activos del tenant con los campos que espera el frontend', async () => {
            prismaMock.catModulos.findMany.mockResolvedValue(modulosDelTenant);

            const resultado = await service.findModulos(user);

            expect(resultado).toEqual(modulosDelTenant);
            const args = (prismaMock.catModulos.findMany.mock.calls[0] as unknown[])[0] as {
                where: unknown;
                select: unknown;
            };
            expect(args.where).toEqual({ Activo: true, idTenant: 3 });
            expect(args.select).toEqual({
                idModulo: true,
                Descripcion: true,
                Codigo: true,
                idPadre: true,
                Activo: true,
            });
        });

        it('responde 500 generico sin exponer el error crudo de Prisma', async () => {
            prismaMock.catModulos.findMany.mockRejectedValue(
                new Error('connect ECONNREFUSED 10.0.0.5 (C:\\Users\\dreyes\\prisma.service.ts)'),
            );

            const error = await capturarError(service.findModulos(user));

            expect(error).toBeInstanceOf(HttpException);
            expect(error.getStatus()).toBe(500);
            const respuesta = error.getResponse() as { message: string; code: string };
            expect(respuesta.code).toBe('ERROR_INTERNO');
            expect(respuesta.message).not.toContain('C:\\');
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('update (PUT /roles/:id)', () => {
        beforeEach(() => {
            txMock.catRoles.findUnique.mockResolvedValue(rolEncontrado);
            txMock.catModulos.findMany.mockResolvedValue([{ idModulo: 10 }, { idModulo: 11 }]);
            txMock.relRolPermisos.findMany.mockResolvedValue([]);
            txMock.relRolPermisos.updateMany.mockResolvedValue({ count: 0 });
        });

        it('devuelve 404 sin escribir nada ni registrar auditoria si el rol es de otro tenant o no existe', async () => {
            txMock.catRoles.findUnique.mockResolvedValue(null);

            const error = await capturarError(service.update(user, 5, dto([permiso(10)])));

            expect(error).toBeInstanceOf(NotFoundException);
            expect(txMock.relRolPermisos.upsert).not.toHaveBeenCalled();
            expect(txMock.relRolPermisos.updateMany).not.toHaveBeenCalled();
            expect(logSpy).not.toHaveBeenCalled();
        });

        it('devuelve 422 con idModulosRechazados si un idModulo no existe, no esta activo o es de otro tenant', async () => {
            txMock.catModulos.findMany.mockResolvedValue([{ idModulo: 10 }]);

            const error = await capturarError(
                service.update(user, 5, dto([permiso(10), permiso(999)])),
            );

            expect(error).toBeInstanceOf(UnprocessableEntityException);
            expect(error.getResponse()).toEqual(
                expect.objectContaining({
                    code: 'MODULOS_INVALIDOS',
                    detail: { idModulosRechazados: [999] },
                }),
            );
            const argsCatalogo = (txMock.catModulos.findMany.mock.calls[0] as unknown[])[0] as {
                where: Record<string, unknown>;
            };
            expect(argsCatalogo.where).toEqual(expect.objectContaining({ Activo: true, idTenant: 3 }));
            expect(txMock.relRolPermisos.upsert).not.toHaveBeenCalled();
            expect(logSpy).not.toHaveBeenCalled();
        });

        it('devuelve 422 con VER_REQUERIDO si crear/editar/eliminar vienen en true con ver en false', async () => {
            const error = await capturarError(
                service.update(
                    user,
                    5,
                    dto([permiso(10, { ver: false, crear: true })]),
                ),
            );

            expect(error).toBeInstanceOf(UnprocessableEntityException);
            expect(error.getResponse()).toEqual(
                expect.objectContaining({
                    code: 'VER_REQUERIDO',
                    detail: { idModulos: [10] },
                }),
            );
            expect(txMock.relRolPermisos.upsert).not.toHaveBeenCalled();
            expect(logSpy).not.toHaveBeenCalled();
        });

        it('usa upsert sobre el unico rol+modulo (idempotente, sin duplicados) y fija tenant y activo=true', async () => {
            const resultado = await service.update(
                user,
                5,
                dto([permiso(10), permiso(11, { ver: false })], { descripcion: 'Reclutador senior' }),
            );

            expect(txMock.relRolPermisos.upsert).toHaveBeenCalledTimes(2);
            expect(txMock.relRolPermisos.upsert).toHaveBeenCalledWith({
                where: { idRol_idModulo: { idRol: 5, idModulo: 10 } },
                create: {
                    idRol: 5,
                    idModulo: 10,
                    idTenant: 3,
                    puedeVer: true,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: true,
                },
                update: {
                    idTenant: 3,
                    puedeVer: true,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: true,
                },
            });
            expect(txMock.catRoles.update).toHaveBeenCalledWith({
                where: { idRol: 5 },
                data: { descripcion: 'Reclutador senior' },
            });

            // La respuesta tiene el mismo formato que el GET (permisos activos)
            const lecturaFinal = (txMock.catRoles.findUnique.mock.calls[1] as unknown[])[0] as {
                where: unknown;
                include: { RelRolPermisos: { where: unknown } };
            };
            expect(lecturaFinal.where).toEqual({ idRol: 5, idTenant: 3 });
            expect(lecturaFinal.include.RelRolPermisos.where).toEqual(
                expect.objectContaining({ activo: true, idTenant: 3 }),
            );
            expect(resultado).toEqual(rolEncontrado);

            expect(logSpy).toHaveBeenCalledTimes(1);
            // Sin modulos removidos no se emite el updateMany
            expect(txMock.relRolPermisos.updateMany).not.toHaveBeenCalled();
            // Timeout explicito de la transaccion (BD remota / VPN)
            expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
                maxWait: 15_000,
                timeout: 20_000,
            });
        });

        it('no ejecuta ninguna escritura si el payload coincide exactamente con el estado previo', async () => {
            txMock.relRolPermisos.findMany.mockResolvedValue([
                {
                    idModulo: 10,
                    puedeVer: true,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: true,
                },
                {
                    idModulo: 11,
                    puedeVer: false,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: true,
                },
            ]);

            await service.update(user, 5, dto([permiso(10), permiso(11, { ver: false })]));

            expect(txMock.relRolPermisos.upsert).not.toHaveBeenCalled();
            expect(txMock.relRolPermisos.updateMany).not.toHaveBeenCalled();
            expect(resumenDelLog()).toEqual({ agregados: 0, modificados: 0, reactivados: 0, desactivados: 0 });
            expect(logSpy).toHaveBeenCalledTimes(1);
        });

        it('desactiva (soft delete) los modulos del rol que ya no vienen en el payload, solo del rol editado', async () => {
            txMock.relRolPermisos.findMany.mockResolvedValue([
                {
                    idModulo: 12,
                    puedeVer: true,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: true,
                },
            ]);

            await service.update(user, 5, dto([permiso(10), permiso(11)]));

            expect(txMock.relRolPermisos.updateMany).toHaveBeenCalledWith({
                where: { idRol: 5, activo: true, idModulo: { notIn: [10, 11] } },
                data: { activo: false },
            });
        });

        it('con permisos vacios desactiva todos los permisos activos del rol (sin condicion notIn)', async () => {
            txMock.relRolPermisos.findMany.mockResolvedValue(
                [1, 2, 3, 4].map((idModulo) => ({
                    idModulo,
                    puedeVer: true,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: true,
                })),
            );
            txMock.relRolPermisos.updateMany.mockResolvedValue({ count: 4 });

            await service.update(user, 5, dto([]));

            expect(txMock.relRolPermisos.updateMany).toHaveBeenCalledWith({
                where: { idRol: 5, activo: true },
                data: { activo: false },
            });
            expect(resumenDelLog()).toEqual({ agregados: 0, modificados: 0, reactivados: 0, desactivados: 4 });
        });

        it('reactiva una fila previamente desactivada con upsert (sin insertar otra)', async () => {
            txMock.relRolPermisos.findMany.mockResolvedValue([
                {
                    idModulo: 10,
                    puedeVer: false,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: false,
                },
            ]);

            await service.update(user, 5, dto([permiso(10)]));

            expect(txMock.relRolPermisos.upsert).toHaveBeenCalledTimes(1);
            const argsUpsert = (txMock.relRolPermisos.upsert.mock.calls[0] as unknown[])[0] as {
                where: unknown;
                update: Record<string, unknown>;
            };
            expect(argsUpsert.where).toEqual({ idRol_idModulo: { idRol: 5, idModulo: 10 } });
            expect(argsUpsert.update).toEqual(expect.objectContaining({ activo: true, puedeVer: true }));
            expect(resumenDelLog()).toEqual({ agregados: 0, modificados: 0, reactivados: 1, desactivados: 0 });
        });

        it('cuenta agregados y modificados en un unico log de auditoria con usuario, rol, tenant y fecha', async () => {
            txMock.relRolPermisos.findMany.mockResolvedValue([
                {
                    idModulo: 10,
                    puedeVer: true,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: true,
                },
                {
                    idModulo: 99,
                    puedeVer: true,
                    puedeCrear: false,
                    puedeActualizar: false,
                    puedeEliminar: false,
                    activo: true,
                },
            ]);
            txMock.relRolPermisos.updateMany.mockResolvedValue({ count: 1 });

            await service.update(
                user,
                5,
                dto([permiso(10, { editar: true }), permiso(11)]),
            );

            expect(logSpy).toHaveBeenCalledTimes(1);
            const mensaje = String(logSpy.mock.calls[0]?.[0]);
            expect(mensaje).toContain('usuario=77');
            expect(mensaje).toContain('rol=5');
            expect(mensaje).toContain('tenant=3');
            expect(mensaje).toContain('fecha=');
            expect(resumenDelLog()).toEqual({ agregados: 1, modificados: 1, reactivados: 0, desactivados: 1 });
        });

        it('no registra auditoria si la transaccion falla y responde 500 generico sin exponer el error crudo', async () => {
            txMock.relRolPermisos.upsert.mockRejectedValueOnce(
                new Error('Transaction API error ... C:\\Users\\dreyes\\Documents\\Talent\\TalentCoreBack\\roles.service.ts'),
            );

            const error = await capturarError(service.update(user, 5, dto([permiso(10)])));

            expect(error).toBeInstanceOf(HttpException);
            expect(error.getStatus()).toBe(500);
            const respuesta = error.getResponse() as { message: string; code: string; error: string };
            expect(respuesta.code).toBe('ERROR_ACTUALIZAR_PERMISOS');
            expect(respuesta.error).toBe('Internal Server Error');
            expect(respuesta.message).toBe('No se pudieron actualizar los permisos del rol. Intenta de nuevo.');
            expect(respuesta.message).not.toContain('C:\\');

            expect(logSpy).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledTimes(1);
            expect(String(errorSpy.mock.calls[0]?.[0])).toContain('update | rol=5 | tenant=3 | usuario=77');
            expect(String(errorSpy.mock.calls[0]?.[0])).toContain('C:\\Users\\dreyes');
        });
    });

    describe('errores internos de Prisma en lecturas', () => {
        it('findOne responde 500 generico sin exponer el error crudo de Prisma', async () => {
            prismaMock.catRoles.findUnique.mockRejectedValue(
                new Error('connect ECONNREFUSED 10.0.0.5 (C:\\Users\\dreyes\\prisma.service.ts)'),
            );

            const error = await capturarError(service.findOne(user, 5));

            expect(error).toBeInstanceOf(HttpException);
            expect(error.getStatus()).toBe(500);
            const respuesta = error.getResponse() as { message: string; code: string };
            expect(respuesta.code).toBe('ERROR_INTERNO');
            expect(respuesta.message).toBe('Ocurrio un error inesperado. Intenta de nuevo.');
            expect(respuesta.message).not.toContain('C:\\');
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it('findAll responde 500 generico sin exponer el error crudo de Prisma', async () => {
            prismaMock.catRoles.findMany.mockRejectedValue(
                new Error('connect ECONNREFUSED 10.0.0.5 (C:\\Users\\dreyes\\prisma.service.ts)'),
            );

            const error = await capturarError(service.findAll(user));

            expect(error).toBeInstanceOf(HttpException);
            expect(error.getStatus()).toBe(500);
            const respuesta = error.getResponse() as { message: string; code: string };
            expect(respuesta.code).toBe('ERROR_INTERNO');
            expect(respuesta.message).not.toContain('C:\\');
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });
    });
});
