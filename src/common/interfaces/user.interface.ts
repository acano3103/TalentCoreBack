
export interface userFullInfo {
    id: number;
    username: string;
    roles: string[];
    enterprises: { id: number; name: string }[];
    modules: string[];
    sites: { id: number; name: string }[];
}