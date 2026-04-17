
export interface IMessageService {
    sendToken(to: string, name: string, token: string): Promise<void>;
}