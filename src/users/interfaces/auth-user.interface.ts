/** Shape returned by the users endpoints — password is never included */
export interface AuthUserRow {
    id: number;
    uuid: string;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    is_superuser: boolean | number;
    is_staff: boolean | number;
    is_active: boolean | number;
    last_login: Date | null;
    date_joined: Date;
    idRol: number | null;
    rol_descripcion: string | null;
}
