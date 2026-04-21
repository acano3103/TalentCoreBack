
export interface NotificationOptions {
    userUuid: string;
    notificationTypeCode: string;
    to?: string;
    phone?: string;
    subject?: string;
    context?: any;
}

export interface INotificationProvider {
    send(options: NotificationOptions): Promise<void>;
}