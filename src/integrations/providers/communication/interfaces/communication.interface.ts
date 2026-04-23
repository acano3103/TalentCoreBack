export interface ICommunicationProvider {
    connect(companyId: number, providerId: number, data: any): Promise<any>;
    disconnect(companyId: number, providerId: number): Promise<any>;
    getMeeting(meetingId: string): Promise<any>;
    createMeeting(companyId: number, providerId: number, data: any): Promise<any>;
    updateMeeting(data: any): Promise<any>;
    deleteMeeting(data: any): Promise<any>;
}