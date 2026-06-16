import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';

@ApiTags('Notifications')
@UseGuards(JwtAuthGuard)
@Controller('notifications/')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get('user/:userUuid')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get user notifications', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Notifications obtained successfully' })
    @ApiResponse({ status: 404, description: 'Notifications not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getNotifications(
        @Param('userUuid') userUuid: string,
        @Query('limit') limit?: string,
        @Query('onlyUnread') onlyUnread?: string,
    ) {
        const limitNum = limit ? parseInt(limit, 10) : undefined;
        const unreadBool = onlyUnread === 'true';
        return await this.notificationsService.getUserNotifications(userUuid, limitNum, unreadBool);
    }

    @Patch('delivery/:deliveryId/read')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Mark notification as read', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Notification marked as read successfully' })
    @ApiResponse({ status: 404, description: 'Notification not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async markAsRead(@Param('deliveryId') deliveryId: string) {
        return await this.notificationsService.markAsRead(deliveryId);
    }

    @Patch('user/:userUuid/read-all')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Mark all notifications as read', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'All notifications marked as read successfully' })
    @ApiResponse({ status: 404, description: 'Notifications not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async markAllAsRead(@Param('userUuid') userUuid: string) {
        return await this.notificationsService.markAllAsRead(userUuid);
    }
}