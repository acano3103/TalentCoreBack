export interface SesionKiosco {
    tipo: 'KIOSCO';
    idKiosco: number;
    idTenant: number;
    idEmpresa: number;
    codigo: string;
    nombre: string;
    modalidad: 'FIJO' | 'CUADRILLA';
    jti: string;
}
