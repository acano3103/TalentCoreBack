import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { UpdateTrainingSettingsDto } from './dto/update-training-settings.dto';
import {
  CLAVES_CAPACITACION,
  CLAVE_DC3_AGENTE_CAPACITADOR,
  TrainingConfig,
  cambiosTrainingConfig,
  guardarCacheTrainingConfig,
  interpretarTrainingConfig,
  leerCacheTrainingConfig,
  olvidarCacheTrainingConfig,
} from './training-config';

@Injectable()
export class ConfigurationService {
  private readonly logger = new Logger(ConfigurationService.name);

  constructor(private prismaService: PrismaService) {}

  // Configuración completa de capacitación. Dentro de un request, la segunda lectura no vuelve a la base.
  async getTrainingConfig(idEmpresa: number): Promise<TrainingConfig> {
    const pendiente = leerCacheTrainingConfig(idEmpresa);
    if (pendiente) return pendiente;

    const carga = this.cargarTrainingConfig(idEmpresa).catch(
      (error: unknown) => {
        olvidarCacheTrainingConfig(idEmpresa);
        throw error;
      },
    );
    guardarCacheTrainingConfig(idEmpresa, carga);
    return carga;
  }

  async getTrainingSettings(companyId: number): Promise<TrainingConfig> {
    return this.getTrainingConfig(companyId);
  }

  // Persiste solo las claves enviadas. Las demás quedan como estaban.
  async updateTrainingSettings(
    companyId: number,
    updateTrainingSettingsDto: UpdateTrainingSettingsDto,
    user: ActiveUserDto,
  ): Promise<TrainingConfig> {
    const cambios = cambiosTrainingConfig(updateTrainingSettingsDto);
    for (const cambio of cambios) {
      await this.prismaService.configuracionEmpresa.upsert({
        where: {
          idEmpresa_clave: {
            idEmpresa: companyId,
            clave: cambio.clave,
          },
        },
        create: {
          idEmpresa: companyId,
          clave: cambio.clave,
          valor: cambio.valor,
          activo: true,
          usuarioRegistro: user.uuid,
        },
        update: { valor: cambio.valor, usuarioRegistro: user.uuid },
      });
    }

    olvidarCacheTrainingConfig(companyId);
    return this.getTrainingConfig(companyId);
  }

  private async cargarTrainingConfig(
    idEmpresa: number,
  ): Promise<TrainingConfig> {
    const filas = await this.prismaService.configuracionEmpresa.findMany({
      where: { idEmpresa, clave: { in: [...CLAVES_CAPACITACION] } },
      select: { clave: true, valor: true },
    });
    const valores = new Map(filas.map((fila) => [fila.clave, fila.valor]));
    const agente = valores.get(CLAVE_DC3_AGENTE_CAPACITADOR);
    const razonSocial =
      agente == null || agente.trim() === ''
        ? await this.razonSocial(idEmpresa)
        : '';
    return interpretarTrainingConfig(
      valores,
      razonSocial,
      idEmpresa,
      this.logger,
    );
  }

  private async razonSocial(idEmpresa: number): Promise<string> {
    const empresa = await this.prismaService.catEmpresas.findUnique({
      where: { idEmpresa },
      select: { razon_social: true },
    });
    return empresa?.razon_social?.trim() ?? '';
  }
}
