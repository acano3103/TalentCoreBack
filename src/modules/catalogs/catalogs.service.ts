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
  | 'tipos-ubicaciones'
  | 'empleados'
  | 'tipos-monedas'
  | 'periodicidades-pagos'
  | 'cursos'
  | 'tipos-cursos';

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) { }

  async getCatalog(companyId: number, nombre: CatalogKey) {
    switch (nombre) {

      case 'roles':
        return this.prisma.catRoles.findMany({
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
          select: { idModulo: true, Descripcion: true, Codigo: true, idPadre: true, Activo: true },
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
        const whereClause = companyId ? { Activo: true, idEmpresa: companyId } : { Activo: true };

        // Consultamos los centros de costos incluyendo sus asignaciones actuales
        const centrosCostos = await this.prisma.catCentroCostos.findMany({
          where: whereClause,
          select: {
            idCentroCostos: true,
            Codigo: true,
            Descripcion: true,
            PresupuestoAnual: true,
            PresupuestoEjecutado: true,
            Activo: true,
            // Incluimos solo el campo PresupuestoAsignado de las relaciones existentes
            RelAreasUbicaciones: {
              select: {
                PresupuestoAsignado: true,
              },
            },
          },
          orderBy: { Descripcion: 'asc' },
        });

        // Mapeamos el resultado para calcular el presupuesto disponible real en el servidor
        return centrosCostos.map((centro) => {
          // Sumamos todo lo que ya se asignó a las áreas/sedes en este centro de costos
          const totalAsignado = centro.RelAreasUbicaciones.reduce(
            (sum, rel) => sum + Number(rel.PresupuestoAsignado || 0),
            0
          );

          const presupuestoAnual = Number(centro.PresupuestoAnual || 0);
          // Disponible = Anual - Lo ya repartido entre las áreas
          const presupuestoDisponible = presupuestoAnual - totalAsignado;

          return {
            idCentroCostos: centro.idCentroCostos,
            Codigo: centro.Codigo,
            Descripcion: centro.Descripcion,
            PresupuestoAnual: presupuestoAnual,
            PresupuestoEjecutado: Number(centro.PresupuestoEjecutado || 0),
            PresupuestoAsignadoTot: totalAsignado,
            PresupuestoDisponible: presupuestoDisponible >= 0 ? presupuestoDisponible : 0,
            Activo: centro.Activo,
          };
        });

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

      case 'empleados':
        return this.prisma.empleados.findMany({
          where: { idEmpresa: companyId, activo: true },
          select: { idEmpleado: true, nombre: true, primerApellido: true, segundoApellido: true, correo: true, telefonoMovil: true },
          orderBy: { nombre: 'asc' },
        });

      case 'tipos-monedas':
        return this.prisma.catTiposMoneda.findMany({
          where: { activo: true },
          select: { idTipoMoneda: true, codigo: true, descripcion: true },
          orderBy: { codigo: 'asc' },
        });

      case 'periodicidades-pagos':
        return this.prisma.catPeriodicidadesPago.findMany({
          where: { activo: true },
          select: { idPeriodicidadPago: true, descripcion: true },
          orderBy: { descripcion: 'asc' },
        });

      case 'cursos':
        return this.prisma.catCursos.findMany({
          where: { idEmpresa: companyId, activo: true },
          select: { idCursos: true, idEmpresa: true, idTipoCurso: true, Descripcion: true, idArea: true },
          orderBy: { idCursos: 'asc' },
        });

      case 'tipos-cursos':
        return this.prisma.catTipoCurso.findMany({
          where: { activo: true },
          select: { idTipoCurso: true, Descripcion: true },
          orderBy: { Descripcion: 'asc' },
        });

      default:
        throw new BadRequestException(
          `Catálogo "${nombre}" no reconocido. Valores válidos: roles, empresas, sites, modulos, areas, tipos-contratacion, modalidades, centro-costos, registros-patronales`,
        );
    }
  }
}
