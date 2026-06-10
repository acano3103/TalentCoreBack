export interface NotificationPreferenceResponse {
  id: number;
  user_uuid: string;
  channel_id: number;
  enabled: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
}
