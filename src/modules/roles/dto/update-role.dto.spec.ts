import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { PermisoModuloDto, UpdateRoleDto } from './update-role.dto';

describe('UpdateRoleDto', () => {
    const todosLosConstraints = (errores: ValidationError[]): Record<string, string> =>
        errores.reduce<Record<string, string>>(
            (acumulado, error) => ({
                ...acumulado,
                ...(error.constraints ?? {}),
                ...todosLosConstraints(error.children ?? []),
            }),
            {},
        );

    const permiso = (idModulo: number, flags: Partial<PermisoModuloDto> = {}) => ({
        idModulo,
        ver: true,
        crear: false,
        editar: false,
        eliminar: false,
        ...flags,
    });

    const validar = (payload: unknown) =>
        validate(plainToInstance(UpdateRoleDto, payload), {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

    it('acepta un payload valido', async () => {
        const errores = await validar({
            rol: { descripcion: 'Reclutador senior' },
            permisos: [permiso(10), permiso(11, { ver: false })],
        });

        expect(errores).toHaveLength(0);
    });

    it('rechaza idModulo repetido en el mismo payload (400)', async () => {
        const errores = await validar({
            permisos: [permiso(10), permiso(10, { editar: true })],
        });

        expect(errores.length).toBeGreaterThan(0);
        expect(errores[0].constraints).toHaveProperty('arrayUnique');
    });

    it('rechaza campos desconocidos en la raiz del payload (400 por forbidNonWhitelisted)', async () => {
        const errores = await validar({
            idTenant: 9,
            permisos: [permiso(10)],
        });

        expect(errores.length).toBeGreaterThan(0);
        expect(todosLosConstraints(errores)).toHaveProperty('whitelistValidation');
    });

    it('rechaza campos desconocidos dentro de rol (no se acepta idRol ni activo)', async () => {
        const errores = await validar({
            rol: { descripcion: 'Nuevo', idRol: 5, activo: true },
            permisos: [permiso(10)],
        });

        expect(errores.length).toBeGreaterThan(0);
        expect(todosLosConstraints(errores)).toHaveProperty('whitelistValidation');
    });

    it('rechaza permisos sin idModulo o con flags no booleanos (400)', async () => {
        const sinIdModulo = await validar({ permisos: [{ ver: true, crear: false, editar: false, eliminar: false }] });
        expect(sinIdModulo.length).toBeGreaterThan(0);

        const flagNoBooleano = await validar({ permisos: [permiso(10, { editar: 'si' as unknown as boolean })] });
        expect(flagNoBooleano.length).toBeGreaterThan(0);
    });

    it('rechaza permisos ausentes (400)', async () => {
        const errores = await validar({ rol: { descripcion: 'Nuevo' } });

        expect(errores.length).toBeGreaterThan(0);
        expect(errores[0].property).toBe('permisos');
    });

    it('rechaza descripcion de rol vacia o mayor a 100 caracteres (400)', async () => {
        const vacia = await validar({ rol: { descripcion: '' }, permisos: [permiso(10)] });
        expect(vacia.length).toBeGreaterThan(0);

        const larga = await validar({ rol: { descripcion: 'x'.repeat(101) }, permisos: [permiso(10)] });
        expect(larga.length).toBeGreaterThan(0);
    });
});
