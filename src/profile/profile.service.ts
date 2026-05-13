import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { join, extname } from 'path';
import { renameSync, existsSync, unlinkSync } from 'fs';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(id: number) {
    const user = await this.prisma.auth_user.findUnique({
      where: { id },
      include: {
        PreferenciasNotificacionesUsuario: true
      }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const requiredChannels = [1, 2, 3]; // 1: Email, 2: WhatsApp, 3: SMS
    const existingChannels = user.PreferenciasNotificacionesUsuario.map(p => p.channel_id);
    const missingChannels = requiredChannels.filter(c => !existingChannels.includes(c));

    if (missingChannels.length > 0) {
      await this.prisma.preferenciasNotificacionesUsuario.createMany({
        data: missingChannels.map(channel_id => ({
          user_uuid: user.uuid,
          channel_id,
          enabled: true
        }))
      });

      // Reload user to get updated preferences
      const updatedUser = await this.prisma.auth_user.findUnique({
        where: { id },
        include: { PreferenciasNotificacionesUsuario: true }
      });
      return this.formatProfile(updatedUser);
    }

    return this.formatProfile(user);
  }

  async updateProfile(id: number, data: any) {
    const { first_name, last_name, email, phone, preferences } = data;

    const user = await this.prisma.auth_user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (first_name !== undefined || last_name !== undefined || email !== undefined || phone !== undefined) {
      await this.prisma.auth_user.update({
        where: { id },
        data: {
          first_name: first_name ?? user.first_name,
          last_name: last_name ?? user.last_name,
          email: email ?? user.email,
          phone: phone ?? user.phone,
        }
      });
    }

    if (preferences && Array.isArray(preferences)) {
      for (const pref of preferences) {
        await this.prisma.preferenciasNotificacionesUsuario.upsert({
          where: {
            user_uuid_channel_id: {
              user_uuid: user.uuid,
              channel_id: pref.channel_id
            }
          },
          update: {
            enabled: pref.enabled,
            updated_at: new Date()
          },
          create: {
            user_uuid: user.uuid,
            channel_id: pref.channel_id,
            enabled: pref.enabled
          }
        });
      }
    }

    return this.getProfile(id);
  }

  async saveAvatar(id: number, file: Express.Multer.File): Promise<string> {
    const user = await this.prisma.auth_user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const avatarsDir = join(process.cwd(), 'src', 'media', 'avatars');
    const finalPath = join(avatarsDir, `${user.username}.jpg`);

    // Remove existing avatar if it's a different extension
    if (existsSync(finalPath) && file.path !== finalPath) {
      unlinkSync(finalPath);
    }

    // Rename the temp file to {username}.jpg
    renameSync(file.path, finalPath);

    return `/api/v2/profile/avatar/${user.username}`;
  }

  private formatProfile(user: any) {
    return {
      uuid: user.uuid,
      username: user.username || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone: user.phone || '',
      is_superuser: user.is_superuser || false,
      preferences: (user.PreferenciasNotificacionesUsuario || []).map((p: any) => ({
        channel_id: p.channel_id,
        enabled: p.enabled
      }))
    };
  }
}
