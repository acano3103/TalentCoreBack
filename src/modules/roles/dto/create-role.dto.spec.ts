import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateRoleDto } from './create-role.dto';

describe('CreateRoleDto', () => {
    const todosLosConstraints = (errores: ValidationError[]): Record<string, string> =>
        errores.reduce<Record<string, string>>(
            (acumulado, error) => ({
                ...acumulado,
                ...(error.constraints ?? {}),
                ...todosLosConstraints(error.children ?? []),
            }),
            {},
        );

    const permiso = (idModulo: number, flags: Partial<{ ver: boolean; crear: boolean; editar: boolean; eliminar: boolean }> = {}) => ({
        idModulo,
        ver: true,
        crear: false,
        editar: false,
        eliminar: false,
        ...flags,
    });

    const validar = (payload: unknown) =>
        validate(plainToInstance(CreateRoleDto, payload), {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

    it('acepta un payload valido', async () => {
        const errores = await validar({
            rol: { descripcion: 'Supervisor de reclutamiento' },
            permisos: [permiso(10), permiso(11, { ver: false })],
        });

        expect(errores).toHaveLength(0);
    });

    it('acepta permisos vacios (la matriz nace en false)', async () => {
        const errores = await validar({ rol: { descripcion: 'Solo lectura' }, permisos: [] });

        expect(errores).toHaveLength(0);
    });

    it('recorta la descripcion antes de validar y de guardarla', async () => {
        const instancia = plainToInstance(CreateRoleDto, {
            rol: { descripcion: '   Admin de prueba   ' },
            permisos: [],
        });

        expect(instancia.rol.descripcion).toBe('Admin de prueba');
        expect(await validar({ rol: { descripcion: '  Admin de prueba  ' }, permisos: [] })).toHaveLength(0);
    });

    it('rechaza rol ausente o sin descripcion (400)', async () => {
        const sinRol = await validar({ permisos: [] });
        expect(sinRol.length).toBeGreaterThan(0);
        expect(sinRol[0].property).toBe('rol');

        const sinDescripcion = await validar({ rol: {}, permisos: [] });
        expect(sinDescripcion.length).toBeGreaterThan(0);

        const soloEspacios = await validar({ rol: { descripcion: '     ' }, permisos: [] });
        expect(soloEspacios.length).toBeGreaterThan(0);
    });

    it('rechaza descripcion vacia o mayor a 100 caracteres tras el trim (400)', async () => {
        const larga = await validar({ rol: { descripcion: 'x'.repeat(101) }, permisos: [] });
        expect(larga.length).toBeGreaterThan(0);

        // 100 caracteres rodeados de espacios: valida porque el trim va antes del MaxLength
        const rodeada = await validar({
            rol: { descripcion: `  ${'x'.repeat(100)}  ` },
            permisos: [],
        });
        expect(rodeada).toHaveLength(0);
    });

    it('rechaza permisos ausentes (400, el campo es obligatorio aunque pueda venir vacio)', async () => {
        const errores = await validar({ rol: { descripcion: 'Nuevo' } });

        expect(errores.length).toBeGreaterThan(0);
        expect(errores[0].property).toBe('permisos');
    });

    it('rechaza idModulo repetido en el mismo payload (400)', async () => {
        const errores = await validar({
            rol: { descripcion: 'Nuevo' },
            permisos: [permiso(10), permiso(10, { editar: true })],
        });

        expect(errores.length).toBeGreaterThan(0);
        expect(errores[0].constraints).toHaveProperty('arrayUnique');
    });

    it('rechaza campos desconocidos en la raiz del payload (400 por forbidNonWhitelisted)', async () => {
        const errores = await validar({
            idTenant: 9,
            rol: { descripcion: 'Nuevo' },
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
        const sinIdModulo = await validar({
            rol: { descripcion: 'Nuevo' },
            permisos: [{ ver: true, crear: false, editar: false, eliminar: false }],
        });
        expect(sinIdModulo.length).toBeGreaterThan(0);

        const flagNoBooleano = await validar({
            rol: { descripcion: 'Nuevo' },
            permisos: [permiso(10, { editar: 'si' as unknown as boolean })],
        });
        expect(flagNoBooleano.length).toBeGreaterThan(0);
    });
});
