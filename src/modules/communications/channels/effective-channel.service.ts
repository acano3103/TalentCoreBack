import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { leerBandera, leerNumero, leerTexto } from '../comms-rows';
import {
    CanalDeEmpleado,
    EmpleadoCanal,
    MARCA_LOGIN_MOVIL,
    PerfilCanal,
    POLITICA_WHATSAPP_DEFAULT,
    ResumenCanales,
    canalEfectivo,
    normalizarCanales,
    resumirCanales,
} from './canales';

const LOTE = 2000;

export interface CanalesEfectivos {
    porEmpleado: CanalDeEmpleado[];
    resumen: ResumenCanales;
}

@Injectable()
export class EffectiveChannelService {
    constructor(private readonly prisma: PrismaService) {}

    async forEmployees(ids: number[], companyId: number): Promise<CanalesEfectivos> {
        if (!ids.length) {
            return { porEmpleado: [], resumen: resumirCanales([]) };
        }
        const [filas, politica] = await Promise.all([this.filas(ids), this.politica(companyId)]);
        const empresas = [
            ...new Set(filas.map((fila) => leerNumero(fila, 'idEmpresa')).filter((id) => id > 0).concat(companyId)),
        ];
        const perfiles = await this.perfiles(empresas);
        const porId = new Map<number, CanalDeEmpleado>();
        for (const fila of filas) {
            const empleado = aEmpleado(fila);
            porId.set(empleado.idEmpleado, canalEfectivo(empleado, perfiles, politica, companyId));
        }
        const porEmpleado = ids.map(
            (id) => porId.get(id) ?? { idEmpleado: id, canales: [], sinCanal: true, nivelPerfil: 'DEFAULT' as const },
        );
        return { porEmpleado, resumen: resumirCanales(porEmpleado) };
    }

    private async filas(ids: number[]): Promise<object[]> {
        const acumulado: object[] = [];
        for (let inicio = 0; inicio < ids.length; inicio += LOTE) {
            const lote = ids.slice(inicio, inicio + LOTE);
            const filas = await this.prisma.$queryRaw<object[]>(Prisma.sql`
                SELECT e.idEmpleado AS idEmpleado,
                       e.idEmpresa AS idEmpresa,
                       e.idSite AS idSite,
                       COALESCE(e.idTipoPersonalOverride, p.idTipoPersonal) AS idTipoPersonal,
                       e.telefonoMovil AS telefonoMovil,
                       e.correo AS correo,
                       CASE WHEN u.uuid IS NOT NULL AND u.is_active = 1 THEN 1 ELSE 0 END AS usuarioWebActivo,
                       CASE WHEN EXISTS (
                           SELECT 1 FROM PushTokens t
                           WHERE t.Activo = 1
                             AND t.FechaBaja IS NULL
                             AND (t.idEmpleado = e.idEmpleado OR (
                                 e.idUsuario IS NOT NULL
                                 AND t.user_uuid COLLATE utf8mb4_unicode_ci = e.idUsuario COLLATE utf8mb4_unicode_ci
                             ))
                       ) THEN 1 ELSE 0 END AS pushActivo,
                       CASE WHEN e.idUsuario IS NOT NULL AND EXISTS (
                           SELECT 1 FROM usuarioslogin l
                           WHERE l.UuidUsuario COLLATE utf8mb4_unicode_ci = e.idUsuario COLLATE utf8mb4_unicode_ci
                             AND l.browser COLLATE utf8mb4_unicode_ci = ${MARCA_LOGIN_MOVIL}
                       ) THEN 1 ELSE 0 END AS loginMovil,
                       CASE WHEN e.idSite IS NOT NULL AND EXISTS (
                           SELECT 1 FROM KioscoSites ks
                           INNER JOIN KioscosAsistencia k ON k.idKiosco = ks.idKiosco
                           WHERE ks.idSite = e.idSite
                             AND k.estatus = 'ACTIVO'
                             AND k.fechaBaja IS NULL
                             AND k.idTenant = e.idTenant
                       ) THEN 1 ELSE 0 END AS kioscoActivo
                FROM Empleados e
                LEFT JOIN CatPuestos p ON p.idPuesto = e.idPuesto
                LEFT JOIN auth_user u ON u.uuid COLLATE utf8mb4_unicode_ci = e.idUsuario COLLATE utf8mb4_unicode_ci
                WHERE e.activo = 1
                  AND e.idEmpleado IN (${Prisma.join(lote)})
            `);
            acumulado.push(...filas);
        }
        return acumulado;
    }

    private async perfiles(empresas: number[]): Promise<PerfilCanal[]> {
        if (!empresas.length) return [];
        const filas = await this.prisma.comPerfilesCanal.findMany({
            where: { idEmpresa: { in: empresas } },
            select: { idEmpresa: true, Nivel: true, idReferencia: true, Canales: true },
        });
        return filas.flatMap((fila) => {
            if (fila.Nivel !== 'EMPLEADO' && fila.Nivel !== 'UBICACION' && fila.Nivel !== 'TIPO_PERSONAL') return [];
            return [
                {
                    idEmpresa: fila.idEmpresa,
                    nivel: fila.Nivel,
                    idReferencia: fila.idReferencia,
                    canales: normalizarCanales(fila.Canales),
                },
            ];
        });
    }

    private async politica(companyId: number): Promise<string> {
        const fila = await this.prisma.comConfigEmpresa.findUnique({
            where: { idEmpresa: companyId },
            select: { PoliticaWhatsApp: true },
        });
        return fila?.PoliticaWhatsApp ?? POLITICA_WHATSAPP_DEFAULT;
    }
}

function aEmpleado(fila: object): EmpleadoCanal {
    const idEmpresa = leerNumero(fila, 'idEmpresa');
    const idSite = leerNumero(fila, 'idSite');
    const idTipo = leerNumero(fila, 'idTipoPersonal');
    return {
        idEmpleado: leerNumero(fila, 'idEmpleado'),
        idEmpresa: idEmpresa > 0 ? idEmpresa : null,
        idSite: idSite > 0 ? idSite : null,
        idTipoPersonal: idTipo > 0 ? idTipo : null,
        telefonoMovil: leerTexto(fila, 'telefonoMovil'),
        correo: leerTexto(fila, 'correo'),
        usuarioWebActivo: leerBandera(fila, 'usuarioWebActivo'),
        pushActivo: leerBandera(fila, 'pushActivo'),
        loginMovil: leerBandera(fila, 'loginMovil'),
        kioscoActivo: leerBandera(fila, 'kioscoActivo'),
    };
}
