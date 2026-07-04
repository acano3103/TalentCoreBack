export interface IAiProvider {
    connect(companyId: number, providerId: number, dto: any): Promise<any>;
    disconnect(companyId: number, providerId: number): Promise<any>;
    generateJobDescription(companyId: number, requirements: any): Promise<string>;
    analyzeCV(companyId: number, postulationId: number, vacancyId: number, pdfBuffer: Buffer, requirements: string): Promise<any>;
}