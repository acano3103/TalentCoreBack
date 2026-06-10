import { Controller, Get, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';

@ApiTags('Notifications')
@UseGuards(JwtAuthGuard)
@Controller('notifications/preferences')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get(':uuid')
  @ApiParam({ name: 'uuid', type: String, description: 'User UUID' })
  @ApiOperation({
    summary: 'Get notification preferences for a user',
    description: 'Returns all notification preferences for a specific user from PreferenciasNotificacionesUsuario table.',
  })
  @ApiResponse({ status: 200, description: 'Notification preferences retrieved successfully.' })
  getPreferences(@Param('uuid') uuid: string) {
    return this.notificationsService.getPreferences(uuid);
  }

  @Patch(':uuid/:channelId')
  @ApiParam({ name: 'uuid', type: String, description: 'User UUID' })
  @ApiParam({ name: 'channelId', type: Number, description: 'Channel ID' })
  @ApiOperation({
    summary: 'Update or create notification preference',
    description: 'Updates an existing notification preference or creates a new one if it does not exist (upsert operation).',
  })
  @ApiResponse({ status: 200, description: 'Preference updated or created successfully.' })
  upsertPreference(
    @Param('uuid') uuid: string,
    @Param('channelId', ParseIntPipe) channelId: number,
    @Body() data: UpdateNotificationPreferenceDto,
  ) {
    return this.notificationsService.upsertPreference(uuid, channelId, data);
  }
}
