export interface IAiProvider {
    connect(companyId: number, providerId: number, dto: any): Promise<any>;
    disconnect(companyId: number, providerId: number): Promise<any>;
    generateJobDescription(companyId: number, requirements: any): Promise<string>;
    analyzeCV(companyId: number, postulationId: number, vacancyId: number, pdfBuffer: Buffer, requirements: string): Promise<any>;
    startRoleplayCall(companyId: number, idTenant: number, idRolePlay: number, idUsuario: number): Promise<{ idLlamada: number; aiMessage: string }>;
    processRoleplayTurn(companyId: number, idTenant: number, idLlamada: number, agentMessage: string): Promise<{ aiMessage: string }>;
    evaluateRoleplayCall(companyId: number, idTenant: number, idLlamada: number): Promise<{ idEvaluacion: number; scoreGlobal: number }>;
}