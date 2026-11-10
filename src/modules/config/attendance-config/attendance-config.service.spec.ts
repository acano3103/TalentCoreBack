jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { AttendanceTrackingConfigService } from './attendance-config.service';
import { DEFAULT_ATTENDANCE_CONFIG } from './interfaces/attendance-config.interface';
import { PrismaService } from 'src/prisma/prisma.service';

function servicioCon(configuracion: unknown) {
  const prisma = {
    tenantConfiguracionesModulos: {
      findUnique: jest.fn(async () =>
        configuracion === undefined ? null : { configuracion },
      ),
    },
  };
  return new AttendanceTrackingConfigService(
    prisma as unknown as PrismaService,
  );
}

describe('AttendanceTrackingConfigService', () => {
  it('completa antirebote con los defaults si la config guardada no trae la llave', async () => {
    const service = servicioCon({
      tolerancia: { minutosToleranciaEntrada: 10 },
      comida: { tiempoComidaMinutos: 45 },
    });

    const config = await service.getConfiguracionAsistencia(1, 2);

    expect(config.antirebote).toEqual({
      ventanaProveedorSegundos: 120,
      ventanaMismoTipoSegundos: 60,
    });
    expect(config.antirebote.ventanaProveedorSegundos).not.toBeUndefined();
    expect(config.tolerancia.minutosToleranciaEntrada).toBe(10);
    expect(config.tolerancia.minutosLimiteRetardo).toBe(
      DEFAULT_ATTENDANCE_CONFIG.tolerancia.minutosLimiteRetardo,
    );
    expect(config.comida.tiempoComidaMinutos).toBe(45);
    expect(config.comida.obligatorioChecarComida).toBe(
      DEFAULT_ATTENDANCE_CONFIG.comida.obligatorioChecarComida,
    );
  });

  it('un antirebote parcial conserva el número que no vino guardado', async () => {
    const service = servicioCon({
      antirebote: { ventanaProveedorSegundos: 90 },
    });

    const config = await service.getConfiguracionAsistencia(1, 2);

    expect(config.antirebote).toEqual({
      ventanaProveedorSegundos: 90,
      ventanaMismoTipoSegundos: 60,
    });
  });
});
