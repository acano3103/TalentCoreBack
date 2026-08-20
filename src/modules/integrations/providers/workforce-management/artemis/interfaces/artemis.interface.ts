export interface IArtemisProvider {
    connect(companyId: number, providerId: number, dto: any): Promise<any>;
    disconnect(companyId: number, providerId: number): Promise<any>;
}