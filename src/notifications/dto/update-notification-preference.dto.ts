import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateNotificationPreferenceDto {
  @ApiProperty({ example: true, description: 'Enable or disable the notification preference' })
  @IsBoolean()
  enabled: boolean;
}
