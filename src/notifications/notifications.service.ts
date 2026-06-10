import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationPreferenceResponse } from './interfaces/notification-preference.interface';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all notification preferences for a specific user
   */
  async getPreferences(
    userUuid: string,
  ): Promise<NotificationPreferenceResponse[]> {
    return this.prisma.preferenciasNotificacionesUsuario.findMany({
      where: { user_uuid: userUuid },
    });
  }

  /**
   * Upsert notification preference (update if exists, create if doesn't)
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
