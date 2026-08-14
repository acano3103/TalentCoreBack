import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CALIFICACION_APROBATORIA } from '../career-plan/career-plan.constants';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { UpdateTrainingSettingsDto } from './dto/update-training-settings.dto';

@Injectable()
export class ConfigurationService {
  constructor(private prismaService: PrismaService) {}

  // Obtiene los ajustes de capacitacion (umbral aprobatorio dinamico por empresa)
  async getTrainingSettings(companyId: number) {
    const config = await this.prismaService.configuracionEmpresa.findUnique({
      where: {
        idEmpresa_clave: {
          idEmpresa: companyId,
          clave: CALIFICACION_APROBATORIA,
        },
      },
    });

    const umbral = Number(config?.valor ?? 8);
    return {
      calificacionAprobatoria: Number.isFinite(umbral) ? umbral : 8,
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
