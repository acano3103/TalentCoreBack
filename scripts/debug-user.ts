import { PrismaClient } from './generated/prisma';

const prisma = new PrismaClient();

async function main() {
    const u = await prisma.auth_user.findFirst({where: {first_name: 'Michael'}});
    console.log('User:', u?.id, u?.username, u?.first_name, u?.last_name);
    
    if (u?.id) {
        const roles: any = await prisma.$queryRaw`SELECT c.descripcion FROM RelUsuarioRol r JOIN CatRoles c ON c.idRol = r.idRol WHERE r.idUsuario = ${u.id}`;
        console.log('Roles DB:', roles);
        
        const rolesIdsRaw: any = await prisma.$queryRaw`SELECT r.idRol FROM RelUsuarioRol r WHERE r.idUsuario = ${u.id} AND r.activo = 1`;
        const rolesIds = rolesIdsRaw.map((r: any) => r.idRol);
        
        if (rolesIds.length > 0) {
            const permisosRaw: any = await prisma.$queryRaw`
                SELECT m.Descripcion, m.Codigo 
                FROM RelRolPermisos p 
                JOIN CatModulos m ON m.idModulo = p.idModulo 
                WHERE p.idRol IN (${rolesIds.join(',')}) AND p.activo = 1 AND m.Activo = 1
            `;
            console.log('Modulos Permitidos DB:', permisosRaw);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
