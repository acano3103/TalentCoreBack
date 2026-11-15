import { CandidatoEnvio, canalesDeRecordatorio, planificarTope } from './entrega';

function candidato(parcial: Partial<CandidatoEnvio> & Pick<CandidatoEnvio, 'idEmpleado'>): CandidatoEnvio {
    return {
        idEmpresa: 10,
        idTenant: 3,
        userUuid: 'u',
        codigo: 'R4',
        referencia: `ref-${parcial.idEmpleado}`,
        intento: 1,
        titulo: 'Documento faltante',
        mensaje: 'falta un documento',
        deepLink: '/companies/10/expediente',
        deepLinkApp: 'talentcore://companies/10/expediente',
        canales: ['APP'],
        telefono: null,
        correo: null,
        zona: 'America/Mexico_City',
        fechaLocal: '2026-11-16',
        inmediato: false,
        ...parcial,
    };
}

describe('planificarTope', () => {
    it('deja pasar el cupo y agrupa el resto en un solo aviso', () => {
        const items = [1, 2, 3, 4, 5, 6].map((n) => candidato({ idEmpleado: 7, referencia: `r${n}` }));
        const plan = planificarTope(items, new Map(), 5);
        expect(plan.individuales).toHaveLength(5);
        expect(plan.grupos).toHaveLength(1);
        expect(plan.grupos[0].mensaje).toBe('Tienes 1 pendientes');
        expect(plan.grupos[0].clave).toBe('recordatorios:7:2026-11-16');
    });

    it('cuenta lo ya enviado hoy dentro del tope', () => {
        const items = [candidato({ idEmpleado: 7, referencia: 'a' }), candidato({ idEmpleado: 7, referencia: 'b' })];
        const plan = planificarTope(items, new Map([[7, 5]]), 5);
        expect(plan.individuales).toHaveLength(0);
        expect(plan.grupos[0].mensaje).toBe('Tienes 2 pendientes');
    });

    it('no mezcla empleados en el mismo grupo', () => {
        const plan = planificarTope(
            [candidato({ idEmpleado: 1 }), candidato({ idEmpleado: 2 })],
            new Map(),
            5,
        );
        expect(plan.grupos).toHaveLength(0);
        expect(plan.individuales.map((item) => item.idEmpleado)).toEqual([1, 2]);
    });
});

describe('canalesDeRecordatorio', () => {
    it('agrega WhatsApp de respaldo en R1 si no tiene app, checa en kiosco y el perfil lo incluye', () => {
        expect(canalesDeRecordatorio({
            codigo: 'R1',
            canalesRegla: ['APP', 'WEB'],
            canalesEfectivos: ['WEB', 'WHATSAPP'],
            tieneApp: false,
            kioscoActivo: true,
        })).toEqual(['WEB', 'WHATSAPP']);
    });

    it('no agrega WhatsApp si ya tiene la app', () => {
        expect(canalesDeRecordatorio({
            codigo: 'R1',
            canalesRegla: ['APP', 'WEB'],
            canalesEfectivos: ['APP', 'WEB', 'WHATSAPP'],
            tieneApp: true,
            kioscoActivo: true,
        })).toEqual(['APP', 'WEB']);
    });

    it('R4 no usa el respaldo de kiosco', () => {
        expect(canalesDeRecordatorio({
            codigo: 'R4',
            canalesRegla: ['APP', 'WEB'],
            canalesEfectivos: ['WEB', 'WHATSAPP'],
            tieneApp: false,
            kioscoActivo: true,
        })).toEqual(['WEB']);
    });
});
