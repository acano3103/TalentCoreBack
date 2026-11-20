import { localTimeToInstant, localWeekdayName } from 'src/modules/attendance/utils/timezone.util';
import { ReminderEngineService } from './reminder-engine.service';

describe('ReminderEngineService', () => {
    const empleados = jest.fn();
    const sites = jest.fn();
    const horarios = jest.fn();
    const registros = jest.fn();
    const reglas = jest.fn();
    const config = jest.fn();
    const enviados = jest.fn();
    const crearEnviado = jest.fn();
    const queryRaw = jest.fn();
    const dispatchComms = jest.fn();
    const prisma = {
        catEmpresas: { findMany: jest.fn() },
        empleados: { findMany: empleados },
        catSites: { findMany: sites },
        horariosEmpleado: { findMany: horarios },
        registrosAsistencia: { findMany: registros },
        comReglasRecordatorio: { findMany: reglas },
        comConfigEmpresa: { findUnique: config },
        comRecordatoriosEnviados: { findMany: enviados, create: crearEnviado },
        $queryRaw: queryRaw,
    };
    const canales = { forEmployees: jest.fn() };
    const dispatcher = { dispatchComms };
    const campana = { publicar: jest.fn() };
    const configService = { get: jest.fn() };
    const service = new ReminderEngineService(
        prisma as never,
        canales as never,
        dispatcher as never,
        campana as never,
        configService as never,
    );

    beforeEach(() => {
        jest.clearAllMocks();
        const ahora = localTimeToInstant('2026-11-16', new Date(Date.UTC(1970, 0, 1, 9, 15, 0)), 'America/Mexico_City');
        service.ahora = () => ahora;
        const dia = localWeekdayName(ahora, 'America/Mexico_City');
        prisma.catEmpresas.findMany.mockResolvedValue([{ idEmpresa: 10, idTenant: 3 }]);
        reglas.mockResolvedValue([]);
        config.mockResolvedValue({
            LimiteDiarioRecordatorios: 5,
            SilencioActivo: false,
            SilencioInicio: '21:00',
            SilencioFin: '07:00',
            PlantillasWhatsApp: null,
        });
        empleados.mockResolvedValue([
            persona(1, 1, 'u1'),
            persona(2, 2, 'u2'),
        ]);
        sites.mockResolvedValue([
            { idSite: 1, zonaHoraria: 'America/Mexico_City' },
            { idSite: 2, zonaHoraria: 'America/Tijuana' },
        ]);
        horarios.mockResolvedValue([
            horario(1, dia),
            horario(2, dia),
        ]);
        queryRaw.mockResolvedValue([]);
        canales.forEmployees.mockResolvedValue({
            porEmpleado: [
                { idEmpleado: 1, canales: ['APP', 'WEB'], sinCanal: false, nivelPerfil: 'DEFAULT' },
                { idEmpleado: 2, canales: ['APP', 'WEB'], sinCanal: false, nivelPerfil: 'DEFAULT' },
            ],
        });
        registros.mockResolvedValue([]);
        enviados.mockResolvedValue([]);
        crearEnviado.mockResolvedValue({});
        dispatchComms.mockResolvedValue({ notificationId: 'n', entregas: [] });
    });

    it('avisa solo a quien ya está en la ventana de su zona horaria', async () => {
        await service.tickMinuto();
        expect(dispatchComms).toHaveBeenCalledTimes(1);
        expect(dispatchComms.mock.calls[0][0]).toEqual({ userUuid: 'u1' });
        expect(dispatchComms.mock.calls[0][1].origenId).toContain('R1');
        expect(dispatchComms.mock.calls[0][1].destino).toEqual({ tipo: 'CHECADOR' });
        expect(dispatchComms.mock.calls[0][1].codigoRegla).toBe('R1');
        expect(crearEnviado).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ idEmpleado: 1, Codigo: 'R1' }),
        }));
    });
});

function persona(idEmpleado: number, idSite: number, idUsuario: string) {
    return {
        idEmpleado,
        idEmpresa: 10,
        idTenant: 3,
        activo: true,
        idUsuario,
        idSite,
        nombre: 'Ana',
        primerApellido: 'López',
        idTipoPersonalOverride: null,
        telefonoMovil: null,
        correo: null,
        idJefeInmediato: null,
        CatPuestos: null,
    };
}

function horario(idEmpleado: number, dia: string) {
    return {
        idEmpleado,
        DiaSemana: dia,
        HoraEntrada: new Date(Date.UTC(1970, 0, 1, 9, 0, 0)),
        HoraSalida: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    };
}
