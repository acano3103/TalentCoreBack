import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/** Catálogos disponibles vía el endpoint genérico */
export type CatalogKey =
  | 'roles'
  | 'empresas'
  | 'sites'
  | 'modulos'
  | 'areas'
  | 'tipos-contratacion'
  | 'modalidades'
  | 'centro-costos'
  | 'registros-patronales'
  | 'tipos-ubicaciones';

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) { }

  async getCatalog(companyId: number, nombre: CatalogKey) {
    switch (nombre) {

      case 'roles':
        return this.prisma.catroles.findMany({
          where: { activo: true },
          select: { idRol: true, descripcion: true, activo: true },
          orderBy: { descripcion: 'asc' },
        });

      case 'empresas':
        return this.prisma.catEmpresas.findMany({
          where: { activo: true },
          select: { idEmpresa: true, nombre_comercial: true, activo: true },
          orderBy: { nombre_comercial: 'asc' },
        });

      case 'sites':
        if (companyId) {
          return this.prisma.catSites.findMany({
            where: { Activo: true, idEmpresa: companyId },
            orderBy: { Descripcion: 'asc' },
          });
        } else {
          return this.prisma.catSites.findMany({
            where: { Activo: true },
            orderBy: { Descripcion: 'asc' },
          });
        }

      case 'modulos':
        return this.prisma.catModulos.findMany({
          where: { Activo: true },
          select: { idModulo: true, Descripcion: true, Activo: true },
          orderBy: { Descripcion: 'asc' },
        });

      case 'areas':
        return this.prisma.catAreas.findMany({
          where: { Activo: true },
          select: { idArea: true, Descripcion: true, Activo: true },
          orderBy: { Descripcion: 'asc' },
        });

      case 'tipos-contratacion':
        return this.prisma.catTipoContratacion.findMany({
          where: { Activo: true },
          select: { idTipoContratacion: true, Descripcion: true, Activo: true },
          orderBy: { Descripcion: 'asc' },
        });

      case 'modalidades':
        return this.prisma.catModalidad.findMany({
          where: { Activo: true },
          select: { idModalidad: true, Descripcion: true, Activo: true },
          orderBy: { Descripcion: 'asc' },
        });

      case 'centro-costos':
        if (companyId) {
          return this.prisma.catCentroCostos.findMany({
            where: { Activo: true, idEmpresa: companyId },
            select: { idCentroCostos: true, Codigo: true, Descripcion: true, PresupuestoAnual: true, PresupuestoEjecutado: true, Activo: true },
            orderBy: { Descripcion: 'asc' },
          });
        } else {
          return this.prisma.catCentroCostos.findMany({
            where: { Activo: true },
            select: { idCentroCostos: true, Codigo: true, Descripcion: true, PresupuestoAnual: true, PresupuestoEjecutado: true, Activo: true },
            orderBy: { Descripcion: 'asc' },
          });
        }

      case 'registros-patronales':
        return this.prisma.catRegistrosPatronales.findMany({
          where: { idEmpresa: companyId, Activo: true },
          orderBy: { idRegistroPatronal: 'asc' },
        });

      case 'tipos-ubicaciones':
        return this.prisma.catTiposUbicacion.findMany({
          where: { Activo: true },
          orderBy: { idTipoUbicacion: 'asc' },
        });

      default:
        throw new BadRequestException(
          `Catálogo "${nombre}" no reconocido. Valores válidos: roles, empresas, sites, modulos, areas, tipos-contratacion, modalidades, centro-costos, registros-patronales`,
        );
    }
  }
}
