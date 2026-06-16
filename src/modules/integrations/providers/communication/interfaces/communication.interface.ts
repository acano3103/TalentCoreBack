export interface ICommunicationProvider {
    connect(companyId: number, providerId: number, data: any): Promise<any>;
    disconnect(companyId: number, providerId: number): Promise<any>;
    getMeeting(meetingId: string): Promise<any>;
    createMeeting(companyId: number, providerId: number, data: any): Promise<any>;
    updateMeeting(data: any): Promise<any>;
    deleteMeeting(companyId: number, providerId: number, meetingId: string): Promise<any>;
}

export interface CommunicationMeetingResponse {
    id: string;
    url: string;
    metadata: object;
}