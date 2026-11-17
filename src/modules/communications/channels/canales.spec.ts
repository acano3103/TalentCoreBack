import { CanalDeEmpleado, EmpleadoCanal, PerfilCanal, canalEfectivo, resumirCanales } from './canales';

function empleado(parcial: Partial<EmpleadoCanal> = {}): EmpleadoCanal {
    return {
        idEmpleado: 7,
        idEmpresa: 10,
        idSite: 3,
        idTipoPersonal: 2,
        telefonoMovil: '5512345678',
        correo: 'ana@empresa.test',
        usuarioWebActivo: true,
        pushActivo: true,
        loginMovil: false,
        kioscoActivo: true,
        ...parcial,
    };
}

function perfil(parcial: Partial<PerfilCanal> & Pick<PerfilCanal, 'nivel' | 'idReferencia' | 'canales'>): PerfilCanal {
    return { idEmpresa: 10, ...parcial };
}

describe('canal efectivo', () => {
    const perfiles: PerfilCanal[] = [
        perfil({ nivel: 'TIPO_PERSONAL', idReferencia: 2, canales: ['APP', 'CORREO', 'KIOSCO'] }),
        perfil({ nivel: 'UBICACION', idReferencia: 3, canales: ['WEB', 'WHATSAPP'] }),
        perfil({ nivel: 'EMPLEADO', idReferencia: 7, canales: ['APP', 'CORREO'] }),
    ];

    it('el perfil de la persona gana al de la ubicación y al del tipo', () => {
        expect(canalEfectivo(empleado(), perfiles, 'IMPORTANTE_CRITICA', 10)).toMatchObject({
            nivelPerfil: 'EMPLEADO',
            canales: ['APP', 'CORREO'],
            sinCanal: false,
        });
    });

    it('sin perfil de persona usa la ubicación, y sin ubicación el tipo', () => {
        const sinPersona = perfiles.filter((item) => item.nivel !== 'EMPLEADO');
        expect(canalEfectivo(empleado(), sinPersona, 'IMPORTANTE_CRITICA', 10).nivelPerfil).toBe('UBICACION');
        expect(canalEfectivo(empleado({ idSite: 9 }), sinPersona, 'IMPORTANTE_CRITICA', 10)).toMatchObject({
            nivelPerfil: 'TIPO_PERSONAL',
            canales: ['APP', 'CORREO', 'KIOSCO'],
        });
    });

    it('sin ningún perfil parte de APP y WEB', () => {
        expect(canalEfectivo(empleado(), [], 'IMPORTANTE_CRITICA', 10)).toMatchObject({
            nivelPerfil: 'DEFAULT',
            canales: ['APP', 'WEB'],
        });
    });

    it('quita el canal si la persona no lo puede recibir', () => {
        const resultado = canalEfectivo(
            empleado({
                pushActivo: false,
                loginMovil: false,
                usuarioWebActivo: false,
                telefonoMovil: '  ',
                correo: null,
                kioscoActivo: false,
            }),
            [perfil({ nivel: 'EMPLEADO', idReferencia: 7, canales: ['APP', 'WEB', 'WHATSAPP', 'CORREO', 'KIOSCO'] })],
            'SIEMPRE',
            10,
        );
        expect(resultado).toMatchObject({ canales: [], sinCanal: true });
    });

    it('APP basta con login móvil, y WhatsApp se apaga con la política NUNCA', () => {
        const base = empleado({ pushActivo: false, loginMovil: true });
        const perfilEmpleado = [perfil({ nivel: 'EMPLEADO', idReferencia: 7, canales: ['APP', 'WHATSAPP'] })];
        expect(canalEfectivo(base, perfilEmpleado, 'IMPORTANTE_CRITICA', 10).canales).toEqual(['APP', 'WHATSAPP']);
        expect(canalEfectivo(base, perfilEmpleado, 'NUNCA', 10).canales).toEqual(['APP']);
        expect(canalEfectivo(base, perfilEmpleado, 'desactivado', 10).canales).toEqual(['APP']);
    });

    it('un perfil de otra empresa no pisa el de la suya', () => {
        const perfilesMixtos = [
            perfil({ idEmpresa: 99, nivel: 'EMPLEADO', idReferencia: 7, canales: ['KIOSCO'] }),
            perfil({ nivel: 'TIPO_PERSONAL', idReferencia: 2, canales: ['CORREO'] }),
        ];
        expect(canalEfectivo(empleado({ pushActivo: false }), perfilesMixtos, 'IMPORTANTE_CRITICA', 10).canales).toEqual([
            'CORREO',
        ]);
    });

    it('el resumen cuenta cada canal y a quien se queda sin ninguno', () => {
        const filas: CanalDeEmpleado[] = [
            { idEmpleado: 1, canales: ['APP', 'WHATSAPP'], sinCanal: false, nivelPerfil: 'DEFAULT' },
            { idEmpleado: 2, canales: ['CORREO', 'KIOSCO'], sinCanal: false, nivelPerfil: 'DEFAULT' },
            { idEmpleado: 3, canales: [], sinCanal: true, nivelPerfil: 'DEFAULT' },
        ];
        expect(resumirCanales(filas)).toEqual({ APP: 1, WEB: 0, WHATSAPP: 1, CORREO: 1, KIOSCO: 1, SIN_CANAL: 1 });
    });

    it('cuenta a quien solo tiene web en WEB y no lo deja fuera del resumen', () => {
        const filas: CanalDeEmpleado[] = [
            { idEmpleado: 1, canales: ['WEB'], sinCanal: false, nivelPerfil: 'DEFAULT' },
            { idEmpleado: 2, canales: ['APP', 'WEB'], sinCanal: false, nivelPerfil: 'DEFAULT' },
            { idEmpleado: 3, canales: [], sinCanal: true, nivelPerfil: 'DEFAULT' },
        ];
        expect(resumirCanales(filas)).toEqual({ APP: 1, WEB: 2, WHATSAPP: 0, CORREO: 0, KIOSCO: 0, SIN_CANAL: 1 });
    });
});
