import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export interface NotificationPreferenceResponse {
  id: number;
  user_uuid: string;
  channel_id: number;
  enabled: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface UpdateNotificationPreferenceDto {
  enabled: boolean;
}

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET all notification preferences for a specific user
   */
  async getPreferences(
    userUuid: string,
  ): Promise<NotificationPreferenceResponse[]> {
    return this.prisma.preferenciasNotificacionesUsuario.findMany({
      where: { user_uuid: userUuid },
    });
  }

  /**
   * PATCH — Upsert notification preference (update if exists, create if doesn't)
   */
  async upsertPreference(
    userUuid: string,
    channelId: number,
    data: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceResponse> {
    return this.prisma.preferenciasNotificacionesUsuario.upsert({
      where: {
        user_uuid_channel_id: {
          user_uuid: userUuid,
          channel_id: channelId,
        },
      },
      update: {
        enabled: data.enabled,
        updated_at: new Date(),
      },
      create: {
        user_uuid: userUuid,
        channel_id: channelId,
        enabled: data.enabled,
      },
    });
  }
}
