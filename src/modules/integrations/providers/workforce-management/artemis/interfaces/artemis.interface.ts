export interface IArtemisProvider {
    connect(companyId: number, providerId: number, dto: any): Promise<any>;
    disconnect(companyId: number, providerId: number): Promise<any>;
}

// ===== ZkBio Integration API (biométricos) — contrato swagger v1 =====

export interface ZkBioDepartment {
    departmentExternalId: string | null;
    cvAccessDepartmentId: string | null;
    name: string | null;
    parentDepartmentExternalId: string | null;
    parentDepartmentName: string | null;
}

export interface ZkBioAccessLevel {
    accessLevelExternalId: string | null;
    cvAccessLevelId: string | null;
    name: string | null;
    businessId: number | null;
    authAreaId: string | null;
    timeSegmentId: string | null;
    startDate: string | null;
    endDate: string | null;
    isInitial: boolean;
}

export interface ZkBioPerson {
    personId: string | null;
    externalId: string | null;
    employeeNumber: string | null;
    status: string | null;
}

// POST /persons — obligatorios: externalId, employeeNumber, firstName, lastName, departmentExternalId
export interface ZkBioCreatePersonRequest {
    externalId: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    departmentExternalId: string;
    email?: string | null;
    mobilePhone?: string | null;
    accessProfileExternalId?: string | null;
    accessLevelExternalIds?: string[] | null;
    birthday?: string | null; // YYYY-MM-DD
    hireDate?: string | null; // YYYY-MM-DD
}

// Departamento padre de la empresa en ZKBio (guardado en metadata de la integración ZKBIO)
export interface ZkBioParentDepartment {
    externalId: string;
    name: string | null;
}

// Formato de error de la API: { code, message, correlationId }
export interface ZkBioError {
    code?: string;
    message?: string;
    correlationId?: string;
}