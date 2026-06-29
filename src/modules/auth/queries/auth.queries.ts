import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { UserData } from "../interfaces/auth-response.interface";
import { auth_user, Prisma } from "generated/prisma/client";

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
        // 1. Obtener Roles Activos del Usuario
        const rolesRaw: any[] = await this.prisma.$queryRaw`
            SELECT c.idRol, c.descripcion FROM RelUsuarioRol r
            JOIN CatRoles c ON c.idRol = r.idRol
            WHERE r.idUsuario = ${userId} AND r.activo = 1 AND c.activo = 1`;

        const roles = rolesRaw.map(r => r.descripcion);
        const rolesIds: number[] = rolesRaw.map(r => r.idRol);

        // 2. Obtener Empresas Activas
        const empresas: any[] = await this.prisma.$queryRaw`
            SELECT e.idEmpresa as id, e.nombre_comercial as nombre FROM RelUsuarioEmpresa r
            JOIN CatEmpresas e ON e.idEmpresa = r.idEmpresa
            WHERE r.idUsuario = ${userId} AND r.activo = 1 AND e.activo = 1`;

        // Si el usuario no tiene roles asignados, devolvemos los módulos vacíos
        if (rolesIds.length === 0) {
            return { id: userId, nombre: fullName, roles, empresas, modulos: [] };
        }

        // 3. CORRECCIÓN: Obtener la matriz de permisos usando Prisma.join
        const permisosRaw: any[] = await this.prisma.$queryRaw`
            SELECT 
                m.idModulo,
                m.Descripcion,
                m.Codigo,
                m.idPadre,
                MAX(p.puedeVer) as puedeVer,
                MAX(p.puedeCrear) as puedeCrear,
                MAX(p.puedeActualizar) as puedeActualizar,
                MAX(p.puedeEliminar) as puedeEliminar
            FROM RelRolPermisos p
            JOIN CatModulos m ON m.idModulo = p.idModulo
            WHERE p.idRol IN (${Prisma.join(rolesIds)})
              AND p.activo = 1 
              AND m.Activo = 1
            GROUP BY m.idModulo, m.Descripcion, m.Codigo, m.idPadre
        `;

        // 4. Construir la estructura jerárquica COMPLETA para el Front
        const modulosPadres = permisosRaw.filter(m => m.idPadre === null);
        const submodulos = permisosRaw.filter(m => m.idPadre !== null);

        const modulosJerarquicos = modulosPadres.map(padre => {
            const hijosDelPadre = submodulos
                .filter(hijo => hijo.idPadre === padre.idModulo)
                .map(hijo => ({
                    code: hijo.Codigo || hijo.Descripcion.toUpperCase().replace(/\s+/g, '_'),
                    name: hijo.Descripcion,
                    permissions: {
                        read: Boolean(hijo.puedeVer),
                        create: Boolean(hijo.puedeCrear),
                        update: Boolean(hijo.puedeActualizar),
                        delete: Boolean(hijo.puedeEliminar)
                    }
                }));

            return {
                code: padre.Codigo || padre.Descripcion.toUpperCase().replace(/\s+/g, '_'),
                name: padre.Descripcion,
                submodules: hijosDelPadre
            };
        });

        return {
            id: userId,
            nombre: fullName,
            roles,
            empresas,
            modulos: modulosJerarquicos as any
        };
    }

    public async getCandidatoData(userId: number, candidateId: number): Promise<UserData> {
        const candidate = await this.prisma.postulaciones.findUnique({ where: { idPostulacion: candidateId } });

        return {
            id: userId,
            nombre: `${candidate?.nombre} ${candidate?.primerApellido}`,
            correo: candidate?.correo || '',
            roles: ['CANDIDATO'],
            modulos: [
                {
                    code: 'portal-candidato',
                    name: 'Portal Candidato',
                    submodules: [
                        {
                            code: 'subir-documentos',
                            name: 'Subir Documentos',
                            permissions: { read: true, create: true, update: true, delete: false }
                        }
                    ]
                }
            ] as any
        };
    }
}