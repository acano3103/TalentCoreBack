import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ContextoAlcance } from '../capabilities/alcance';
import { leerNumero } from '../comms-rows';
import { consultaAudiencia, consultaEmpleadoEnAlcance, consultaEmpleadoEnCriterios } from './alcance-sql';
import {
    CriteriosAudiencia,
    empresasPermitidas,
    idsFueraDeEstructura,
    normalizarCriterios,
    ResultadoAudiencia,
    unicos,
} from './criterios';

@Injectable()
export class AudienceResolverService {
    constructor(private readonly prisma: PrismaService) {}

    async resolve(criterios: CriteriosAudiencia, scope: ContextoAlcance): Promise<ResultadoAudiencia> {
        const limpios = normalizarCriterios(criterios);
        const [ids, fueraCatalogo] = await Promise.all([
            this.consultar(limpios, scope),
            this.catalogoFuera(limpios, scope),
        ]);
        const encontrados = new Set(ids);
        const fueraAgregar = (limpios.agregarEmpleados ?? []).filter((id) => !encontrados.has(id));
        return { ids, fueraDeAlcance: unicos([...fueraCatalogo, ...fueraAgregar]) };
    }

    async enAlcance(idEmpleado: number, scope: ContextoAlcance): Promise<boolean> {
        const filas = await this.prisma.$queryRaw<{ idEmpleado: number }[]>(consultaEmpleadoEnAlcance(idEmpleado, scope));
        return filas.length > 0;
    }

    /** Criterios congelados de un comunicado, sin volver a aplicar el alcance del publicador. */
    async coincideConCriterios(idEmpleado: number, criterios: CriteriosAudiencia, scope: ContextoAlcance): Promise<boolean> {
        const filas = await this.prisma.$queryRaw<{ idEmpleado: number }[]>(
            consultaEmpleadoEnCriterios(idEmpleado, normalizarCriterios(criterios), scope),
        );
        return filas.length > 0;
    }

    private async consultar(criterios: CriteriosAudiencia, scope: ContextoAlcance): Promise<number[]> {
        const filas = await this.prisma.$queryRaw<{ idEmpleado: number }[]>(consultaAudiencia(criterios, scope));
        return unicos(filas.map((fila) => leerNumero(fila, 'idEmpleado')));
    }

    private async catalogoFuera(criterios: CriteriosAudiencia, scope: ContextoAlcance): Promise<number[]> {
        const tareas: Promise<number[]>[] = [];
        if (criterios.empresas?.length) tareas.push(this.faltanEmpresas(criterios.empresas, scope));
        if (criterios.unidades?.length) tareas.push(this.faltanUnidades(criterios.unidades, scope));
        if (criterios.ubicaciones?.length) tareas.push(this.faltanUbicaciones(criterios.ubicaciones, scope));
        if (criterios.areas?.length) tareas.push(this.faltanAreas(criterios.areas, scope));
        if (criterios.puestos?.length) tareas.push(this.faltanPuestos(criterios.puestos, scope));
        if (criterios.etiquetas?.length) tareas.push(this.faltanEtiquetas(criterios.etiquetas, scope));
        if (criterios.tiposPersonal?.length) tareas.push(this.faltanTipos(criterios.tiposPersonal, scope));
        if (criterios.campanas?.length) tareas.push(this.faltanCampanas(criterios.campanas));
        if (criterios.jefes?.length) {
            tareas.push(this.faltanJefes(unicos(criterios.jefes.map((jefe) => jefe.idEmpleado)), scope));
        }
        const extras = await Promise.all(tareas);
        return unicos([...idsFueraDeEstructura(criterios, scope), ...extras.flat()]);
    }

    private async faltanEmpresas(ids: number[], scope: ContextoAlcance): Promise<number[]> {
        const permitidas = empresasPermitidas(scope);
        const pedidas = permitidas ? ids.filter((id) => permitidas.has(id)) : ids;
        const filas = await this.prisma.catEmpresas.findMany({
            where: { idTenant: scope.idTenant, idEmpresa: { in: pedidas.length ? pedidas : [-1] } },
            select: { idEmpresa: true },
        });
        return ausentes(ids, filas.map((fila) => fila.idEmpresa));
    }

    private async faltanUnidades(ids: number[], scope: ContextoAlcance): Promise<number[]> {
        const permitidas = empresasPermitidas(scope);
        const filas = await this.prisma.catUnidadesOperativas.findMany({
            where: {
                idTenant: scope.idTenant,
                idUnidadOperativa: { in: ids },
                ...(permitidas ? { idEmpresa: { in: [...permitidas] } } : {}),
            },
            select: { idUnidadOperativa: true },
        });
        return ausentes(ids, filas.map((fila) => fila.idUnidadOperativa));
    }

    private async faltanUbicaciones(ids: number[], scope: ContextoAlcance): Promise<number[]> {
        const permitidas = empresasPermitidas(scope);
        const pedidas = scope.alcance === 'UBICACIONES' ? ids.filter((id) => scope.sitesUsuario.includes(id)) : ids;
        const filas = await this.prisma.catSites.findMany({
            where: {
                idTenant: scope.idTenant,
                idSite: { in: pedidas.length ? pedidas : [-1] },
                ...(permitidas ? { idEmpresa: { in: [...permitidas] } } : {}),
            },
            select: { idSite: true },
        });
        return ausentes(ids, filas.map((fila) => fila.idSite));
    }

    private async faltanAreas(ids: number[], scope: ContextoAlcance): Promise<number[]> {
        const permitidas = empresasPermitidas(scope);
        const filas = await this.prisma.catAreas.findMany({
            where: {
                idArea: { in: ids },
                ...(permitidas ? { idEmpresa: { in: [...permitidas] } } : { idTenant: scope.idTenant }),
            },
            select: { idArea: true },
        });
        return ausentes(ids, filas.map((fila) => fila.idArea));
    }

    private async faltanPuestos(ids: number[], scope: ContextoAlcance): Promise<number[]> {
        const permitidas = empresasPermitidas(scope);
        const filas = await this.prisma.catPuestos.findMany({
            where: {
                idPuesto: { in: ids },
                idTenant: scope.idTenant,
                ...(permitidas ? { idEmpresa: { in: [...permitidas] } } : {}),
            },
            select: { idPuesto: true },
        });
        return ausentes(ids, filas.map((fila) => fila.idPuesto));
    }

    private async faltanEtiquetas(ids: number[], scope: ContextoAlcance): Promise<number[]> {
        const filas = await this.prisma.catEtiquetasPuesto.findMany({
            where: { idTenant: scope.idTenant, idEtiqueta: { in: ids } },
            select: { idEtiqueta: true },
        });
        return ausentes(ids, filas.map((fila) => fila.idEtiqueta));
    }

    private async faltanTipos(ids: number[], scope: ContextoAlcance): Promise<number[]> {
        const filas = await this.prisma.catTiposPersonal.findMany({
            where: { idTenant: scope.idTenant, idTipoPersonal: { in: ids } },
            select: { idTipoPersonal: true },
        });
        return ausentes(ids, filas.map((fila) => fila.idTipoPersonal));
    }

    private async faltanCampanas(ids: number[]): Promise<number[]> {
        const filas = await this.prisma.catCampa_a.findMany({
            where: { idCampa_a: { in: ids } },
            select: { idCampa_a: true },
        });
        return ausentes(ids, filas.map((fila) => fila.idCampa_a));
    }

    private async faltanJefes(ids: number[], scope: ContextoAlcance): Promise<number[]> {
        const permitidas = empresasPermitidas(scope);
        const filas = await this.prisma.empleados.findMany({
            where: {
                idEmpleado: { in: ids },
                idTenant: scope.idTenant,
                activo: true,
                ...(permitidas ? { idEmpresa: { in: [...permitidas] } } : {}),
            },
            select: { idEmpleado: true },
        });
        return ausentes(ids, filas.map((fila) => fila.idEmpleado));
    }
}

function ausentes(pedidos: number[], encontrados: number[]): number[] {
    const ok = new Set(encontrados);
    return pedidos.filter((id) => !ok.has(id));
}

export function textoSql(valor: unknown): string {
    if (valor && typeof valor === 'object' && 'strings' in valor && 'values' in valor) {
        const sql = valor as { strings: string[]; values: unknown[] };
        let texto = '';
        sql.strings.forEach((parte, indice) => {
            texto += parte;
            if (indice < sql.values.length) texto += textoSql(sql.values[indice]);
        });
        return texto;
    }
    if (typeof valor === 'bigint') return valor.toString();
    return valor == null ? '' : String(valor);
}
