jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { HttpException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PermisoModuloDto, UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

describe('RolesService', () => {
    let service: RolesService;
    let logSpy: jest.SpyInstance<void, unknown[]>;
    let errorSpy: jest.SpyInstance<void, unknown[]>;

    const user = { id: 77, idTenant: 3 } as ActiveUserDto;

    const txMock = {
        catRoles: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        catModulos: {
            findMany: jest.fn(),
        },
        relRolPermisos: {
            findMany: jest.fn(),
            upsert: jest.fn(),
            updateMany: jest.fn(),
        },
    };

    const prismaMock = {
        catRoles: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
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
