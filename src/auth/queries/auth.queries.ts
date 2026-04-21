import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { UserData } from "../interfaces/auth-response.interface";
import { auth_user } from "generated/prisma/client";

@Injectable()
export class AuthDataService {
    constructor(private readonly prisma: PrismaService) { }

    public async getUserSystem(user: string): Promise<auth_user | null> {
        const result = await this.prisma.$queryRaw<auth_user[]>`
            SELECT * FROM auth_user 
            WHERE BINARY username = ${user}
            LIMIT 1
        `;

        return result[0] ?? null;
    }

    public async getStaffData(userId: number, fullName: string): Promise<UserData> {
        // 1. Roles
        const rolesRaw: any[] = await this.prisma.$queryRaw`
            SELECT c.descripcion FROM relUsuarioRol r
            JOIN catroles c ON c.idRol = r.idRol
            WHERE r.idUsuario = ${userId} AND r.activo = 1 AND c.activo = 1`;
        const roles = rolesRaw.map(r => r.descripcion);

        // 2. Companies
        const empresas: any[] = await this.prisma.$queryRaw`
            SELECT e.idEmpresa as id, e.nombre_comercial as nombre FROM RelUsuarioEmpresa r
            JOIN CatEmpresas e ON e.idEmpresa = r.idEmpresa
            WHERE r.idUsuario = ${userId} AND r.activo = 1 AND e.activo = 1`;

        // 3. Modules
        const modulosRaw: any[] = await this.prisma.$queryRaw`
            SELECT m.Descripcion FROM RelModuloUsuario r
            JOIN CatModulos m ON m.idModulo = r.idModulo
            WHERE r.idUsuario = ${userId} AND r.Activo = 1 AND m.Activo = 1`;
        const modulos = modulosRaw.map(m => m.Descripcion);

        return { id: userId, nombre: fullName, roles, empresas, modulos };
    }

    public async getCandidatoData(userId: number, candidateId: number): Promise<UserData> {
        const candidate = await this.prisma.candidatos.findUnique({ where: { idCandidato: candidateId } });

        return {
            id: userId,
            nombre: `${candidate?.nombre} ${candidate?.primerApellido}`,
            correo: candidate?.correo || '',
            roles: ['CANDIDATO'],
            modulos: ['Subir Documentos']
        };
    }
}