import { Prisma } from 'generated/prisma/client';

export interface ConteoCampana {
    companyId: number | null;
    total: number;
    porCategoria: { categoria: string; total: number }[];
}

export function armarConteo(companyId: number | null, categorias: readonly (string | null)[]): ConteoCampana {
    const mapa = new Map<string, number>();
    for (const categoria of categorias) {
        const clave = categoria?.trim() || 'GENERAL';
        mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    }
    const porCategoria = [...mapa.entries()]
        .map(([categoria, total]) => ({ categoria, total }))
        .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es'));
    return { companyId, total: categorias.length, porCategoria };
}

export function whereNoLeidas(filtro: {
    userUuid: string;
    companyId?: number | null;
    idTenant?: number | null;
    ahora: Date;
    categoria?: string | null;
}): Prisma.NotificacionesWhereInput {
    const alcance: Prisma.NotificacionesWhereInput[] = [
        { user_uuid: filtro.userUuid },
        { read_at: null },
        { OR: [{ ExpiraEn: null }, { ExpiraEn: { gt: filtro.ahora } }] },
    ];
    if (filtro.companyId) alcance.push({ OR: [{ idEmpresa: filtro.companyId }, { idEmpresa: null }] });
    if (filtro.idTenant) alcance.push({ OR: [{ idTenant: filtro.idTenant }, { idTenant: null }] });
    const categoria = filtro.categoria?.trim();
    if (categoria) alcance.push({ Categoria: categoria });
    return { AND: alcance };
}
