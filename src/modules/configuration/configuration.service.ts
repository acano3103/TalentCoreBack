import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CALIFICACION_APROBATORIA } from '../career-plan/career-plan.constants';
import { resolverUmbralAprobatorio } from '../career-plan/career-plan.avance';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { UpdateTrainingSettingsDto } from './dto/update-training-settings.dto';

@Injectable()
export class ConfigurationService {
  private readonly logger = new Logger(ConfigurationService.name);

  constructor(private prismaService: PrismaService) {}

  // Umbral efectivo (0-100). Sin configurar es 70; un valor <= 10 se lee como escala 0-10.
  async getTrainingSettings(companyId: number) {
    const config = await this.prismaService.configuracionEmpresa.findUnique({
      where: {
        idEmpresa_clave: {
          idEmpresa: companyId,
          clave: CALIFICACION_APROBATORIA,
        },
      },
    });

    return {
      calificacionAprobatoria: resolverUmbralAprobatorio(
        config?.valor,
        companyId,
        this.logger,
      ),
    };
  }

  // Persiste el umbral aprobatorio (0-100 validado en DTO)
  async updateTrainingSettings(
    companyId: number,
    updateTrainingSettingsDto: UpdateTrainingSettingsDto,
    user: ActiveUserDto,
  ) {
    const valor = String(updateTrainingSettingsDto.calificacionAprobatoria);

    await this.prismaService.configuracionEmpresa.upsert({
      where: {
        idEmpresa_clave: {
          idEmpresa: companyId,
          clave: CALIFICACION_APROBATORIA,
        },
      },
      create: {
        idEmpresa: companyId,
        clave: CALIFICACION_APROBATORIA,
        valor,
        activo: true,
        usuarioRegistro: user.uuid,
      },
      update: { valor, usuarioRegistro: user.uuid },
    });

    return this.getTrainingSettings(companyId);
  }
}
