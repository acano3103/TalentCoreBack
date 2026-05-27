export interface IAiProvider {
    connect(companyId: number, providerId: number, dto: any): Promise<any>;
    disconnect(companyId: number, providerId: number): Promise<any>;
    analyzeCV(pdfBuffer: Buffer, options?: any): Promise<any>; // Tu método estrella para los CVs
}