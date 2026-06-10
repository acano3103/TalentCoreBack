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
  | 'modalidades';

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCatalog(nombre: CatalogKey) {
    switch (nombre) {

      case 'roles':
        return this.prisma.catroles.findMany({
          where:   { activo: true },
          select:  { idRol: true, descripcion: true, activo: true },
          orderBy: { descripcion: 'asc' },
        });

      case 'empresas':
        return this.prisma.catEmpresas.findMany({
          where:   { activo: true },
          select:  { idEmpresa: true, nombre_comercial: true, activo: true },
          orderBy: { nombre_comercial: 'asc' },
        });

      case 'sites':
        return this.prisma.catSites.findMany({
          where:   { Activo: true },
          select:  { idSite: true, Descripcion: true, Activo: true },
          orderBy: { Descripcion: 'asc' },
        });

      case 'modulos':
        return this.prisma.catModulos.findMany({
          where:   { Activo: true },
          select:  { idModulo: true, Descripcion: true, Activo: true },
          orderBy: { Descripcion: 'asc' },
        });

      case 'areas':
        return this.prisma.catAreas.findMany({
          where:   { Activo: true },
          select:  { idArea: true, Descripcion: true, Activo: true },
          orderBy: { Descripcion: 'asc' },
        });

      case 'tipos-contratacion':
        return this.prisma.catTipoContratacion.findMany({
          where:   { Activo: true },
          select:  { idTipoContratacion: true, Descripcion: true, Activo: true },
          orderBy: { Descripcion: 'asc' },
        });

      case 'modalidades':
        return this.prisma.catModalidad.findMany({
          where:   { Activo: true },
          select:  { idModalidad: true, Descripcion: true, Activo: true },
          orderBy: { Descripcion: 'asc' },
        });

      default:
        throw new BadRequestException(
          `Catálogo "${nombre}" no reconocido. Valores válidos: roles, empresas, sites, modulos, areas, tipos-contratacion, modalidades`,
        );
    }
  }
}
