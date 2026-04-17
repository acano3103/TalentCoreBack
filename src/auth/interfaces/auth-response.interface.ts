export interface UserData {
    id: number;
    nombre: string;
    roles: string[];
    empresas?: { id: number; nombre: string }[];
    modulos: string[];
    correo?: string;
}

export interface AuthSuccessResponse {
    token: string;
    user_type: 'staff' | 'candidato';
    userData: UserData;
}