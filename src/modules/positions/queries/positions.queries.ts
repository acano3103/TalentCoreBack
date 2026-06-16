import { PrismaService } from 'src/prisma/prisma.service';

export class PositionQueries {
  static async findAll(prisma: PrismaService, companyId: number, search: string, page: number, limit: number, aprobada: number) {
    const skip = (page - 1) * limit;

    const searchQuery = search ? `%${search}%` : '%';

    const [data, [{ total }]] = await Promise.all([
      prisma.$queryRaw`
        SELECT 
          p.idPuesto,
          p.NombrePuesto,
          p.DescripcionPuesto,
          a.Descripcion AS Area,
          tp.Descripcion AS TipoPuesto,
          tc.Descripcion AS TipoContratacion,
          m.Descripcion AS Modalidad,
          e.Descripcion AS Escolaridad,
          p.DisponibilidadViajar,
          ns.NombreNivel AS NivelSalario,
          ns.SalarioMinimo,
          ns.SalarioMaximo,
          p.Activo,
          p.aprobada as Aprovada,
          p.pendiente as Pendiente
        FROM CatPuestos p
        LEFT JOIN CatAreas a ON a.idArea = p.idArea
        LEFT JOIN CatSites s ON s.idSite = a.idSite
        LEFT JOIN CatEmpresas ce ON ce.idEmpresa = s.idEmpresa
        LEFT JOIN CatTipoPuesto tp ON tp.idTipoPuesto = p.idTipoPuesto
        LEFT JOIN CatTipoContratacion tc ON tc.idTipoContratacion = p.idTipoContratacion
        LEFT JOIN CatModalidad m ON m.idModalidad = p.idModalidad
        LEFT JOIN CatEscolaridad e ON e.idNivelEstudios = p.idNivelEstudios
        LEFT JOIN CatNivelesSalario ns ON ns.IdNivelSalario = p.IdNivelSalario
        WHERE ce.idEmpresa = ${companyId}
          AND p.aprobada = ${aprobada}
          AND (p.NombrePuesto LIKE ${searchQuery} OR p.DescripcionPuesto LIKE ${searchQuery})
        ORDER BY p.idPuesto DESC
        LIMIT ${limit} OFFSET ${skip};
      ` as Promise<any[]>,

      prisma.$queryRaw`
        SELECT COUNT(*) AS total
        FROM CatPuestos p
        LEFT JOIN CatAreas a ON a.idArea = p.idArea
        LEFT JOIN CatSites s ON s.idSite = a.idSite
        LEFT JOIN CatEmpresas ce ON ce.idEmpresa = s.idEmpresa
        WHERE ce.idEmpresa = ${companyId}
          AND p.aprobada = ${aprobada}
          AND (p.NombrePuesto LIKE ${searchQuery} OR p.DescripcionPuesto LIKE ${searchQuery});
      ` as Promise<[{ total: bigint | number }]>
    ]);

    return {
      positions: data,
      total: Number(total || 0)
    };
  }

  static async findValidationDetails(prisma: PrismaService, positionId: number) {
    const [idiomas, documentos, cursos, funciones, competencias, habilidades, horarios, [maestro]] = await Promise.all([
      prisma.$queryRaw`
      SELECT i.idRelIdioma, i.idIdioma, c.Descripcion AS nombreIdioma, i.Nivel
      FROM IdiomasPuesto i
      INNER JOIN CatIdiomas c ON c.idIdioma = i.idIdioma
      WHERE i.idPuesto = ${positionId};
    ` as Promise<any[]>,

      prisma.$queryRaw`
      SELECT d.idDocPuesto, d.idDocumento, c.Descripcion AS nombreDocumento, d.esObligatorio
      FROM DocumentosPuesto d
      INNER JOIN CatDocumentos c ON c.IdDocumento = d.idDocumento
      WHERE d.idPuesto = ${positionId};
    ` as Promise<any[]>,

      prisma.$queryRaw`
      SELECT r.idRelPuestoCurso, r.idCurso, c.Descripcion AS nombreCurso, r.idTipoCurso, t.Descripcion AS nombreTipoCurso
      FROM RelPuestoCurso r
      INNER JOIN CatCursos c ON c.idCursos = r.idCurso
      INNER JOIN CatTipoCurso t ON t.idTipoCurso = r.idTipoCurso
      WHERE r.idPuesto = ${positionId} AND r.activo = 1;
    ` as Promise<any[]>,

      prisma.$queryRaw`
      SELECT f.idFuncionPuesto, f.Funcion 
      FROM FuncionesPuesto f 
      WHERE f.idPuesto = ${positionId};
    ` as Promise<any[]>,

      prisma.$queryRaw`
      SELECT c.idCompetenciaPuesto, c.Competencia 
      FROM CompetenciasPuesto c 
      WHERE c.idPuesto = ${positionId};
    ` as Promise<any[]>,

      prisma.$queryRaw`
      SELECT h.idHabilidadPuesto, h.Habilidad, h.Nivel, h.Tipo 
      FROM HabilidadesPuesto h 
      WHERE h.idPuesto = ${positionId};
    ` as Promise<any[]>,

      prisma.$queryRaw`
      SELECT ho.idHorario, ho.DiaSemana, ho.HoraEntrada, ho.HoraSalida 
      FROM HorariosPuesto ho 
      WHERE ho.idPuesto = ${positionId};
    ` as Promise<any[]>,

      prisma.$queryRaw`
      SELECT 
        p.idPuesto,
        p.NombrePuesto,
        p.DescripcionPuesto,
        p.aprobada AS Aprobada,
        p.pendiente AS Pendiente,
        p.DisponibilidadViajar,
        p.idJefeInmediato,
        a.Descripcion AS nombreArea,
        tp.Descripcion AS nombreTipoPuesto,
        tc.Descripcion AS nombreTipoContratacion,
        m.Descripcion AS nombreModalidad,
        e.Descripcion AS nombreEscolaridad,
        ns.NombreNivel AS nombreNivelSalario,
        ns.SalarioMinimo,               -- 🚀 Agregado al SELECT
        ns.SalarioMaximo,               -- 🚀 Agregado al SELECT
        j.NombrePuesto AS nombreJefeInmediato
      FROM CatPuestos p
      LEFT JOIN CatAreas a ON a.idArea = p.idArea
      LEFT JOIN CatTipoPuesto tp ON tp.idTipoPuesto = p.idTipoPuesto
      LEFT JOIN CatTipoContratacion tc ON tc.idTipoContratacion = p.idTipoContratacion
      LEFT JOIN CatModalidad m ON m.idModalidad = p.idModalidad
      LEFT JOIN CatEscolaridad e ON e.idNivelEstudios = p.idNivelEstudios
      LEFT JOIN CatNivelesSalario ns ON ns.IdNivelSalario = p.IdNivelSalario
      LEFT JOIN CatPuestos j ON j.idPuesto = p.idJefeInmediato
      WHERE p.idPuesto = ${positionId};
    ` as Promise<any[]>
    ]);

    return { maestro: maestro || null, idiomas, documentos, cursos, funciones, competencias, habilidades, horarios };
  }

  static async getPositionInfo(prisma: PrismaService, positionId: number) {
    const result = await prisma.$queryRaw<any[]>`
            SELECT 
                p.NombrePuesto AS positionName, 
                u.email,
                u.phone,
                u.uuid AS userUuid, 
                CONCAT(u.first_name, ' ', u.last_name) AS name
            FROM CatPuestos p
            JOIN auth_user u ON u.uuid = p.idUsuarioRegistro COLLATE utf8mb4_unicode_ci
            WHERE p.idPuesto = ${positionId}
            LIMIT 1
        `;
    return result[0] ?? null;
  }

  static async approvePosition(prisma: PrismaService, positionId: number, comment: string) {
    await prisma.$executeRaw`
            UPDATE CatPuestos
            SET aprobada = 1,
                Activo = 1,
                pendiente = 0,
                comentarios = ${comment}
            WHERE idPuesto = ${positionId}
        `;
  }

  static async rejectPosition(prisma: PrismaService, positionId: number, comment: string) {
    await prisma.$executeRaw`
            UPDATE CatPuestos
            SET aprobada = 0,
                pendiente = 0,
                comentarios = ${comment}
            WHERE idPuesto = ${positionId}
        `;
  }

  static async getPostulantsSummary(prisma: PrismaService, idPuesto: number) {
    return await prisma.$queryRaw`
      SELECT 
        p.idPostulacion,
        p.nombre,
        p.primerApellido,
        p.segundoApellido,
        pp.estado_proceso,
        pp.score_global,
        pp.indices,
        pp.detalle_por_categoria,
        p.correo,
        p.telefono,
        p.rutaCV,
        p.fechaRegistro,
        c.NombrePuesto,
        c.SalarioMinimo,
        c.SalarioMaximo,
        c.Vacantes,
        m.Descripcion AS Modalidad
      FROM Postulaciones p
      INNER JOIN CatPuestos c ON p.idPuesto = c.idPuesto
      LEFT JOIN CatModalidad m ON c.idModalidad = m.idModalidad
      LEFT JOIN PerfilPostulante pp ON p.idPostulacion = pp.idPostulacion
      WHERE p.idPuesto = ${idPuesto}
      AND pp.score_global IS NOT NULL
      ORDER BY pp.score_global DESC;
    `;
  }

  static async getActivePositions(prisma: PrismaService, companyId: number) {
    return await prisma.$queryRaw`
      SELECT 
        p.idPuesto,
        p.NombrePuesto,
        p.DescripcionPuesto,
        a.Descripcion AS Area,
        tp.Descripcion AS TipoPuesto,
        tc.Descripcion AS TipoContratacion,
        m.Descripcion AS Modalidad,
        e.Descripcion AS Escolaridad,
        s.Descripcion AS Site,
        
        COALESCE(counts.total_cvs, 0) AS TotalCVs,
        COALESCE(counts.total_aprobados, 0) AS TotalAprobados,
        COALESCE(counts.total_rechazados, 0) AS TotalRechazados
      FROM CatPuestos p
      INNER JOIN CatAreas a ON a.idArea = p.idArea
      INNER JOIN CatSites s ON s.idSite = a.idSite
      INNER JOIN CatEmpresas ce ON ce.idEmpresa = s.idEmpresa
      LEFT JOIN CatTipoPuesto tp ON tp.idTipoPuesto = p.idTipoPuesto
      LEFT JOIN CatTipoContratacion tc ON tc.idTipoContratacion = p.idTipoContratacion
      LEFT JOIN CatModalidad m ON m.idModalidad = p.idModalidad
      LEFT JOIN CatEscolaridad e ON e.idNivelEstudios = p.idNivelEstudios

      -- Subquery óptimo para agrupar postulaciones por puesto
      LEFT JOIN (
        SELECT 
          post.idPuesto,
          COUNT(post.idPostulacion) AS total_cvs,
          -- Contamos como aprobados los que tengan score mayor o igual a 8
          SUM(CASE WHEN perf.score_global >= 8 THEN 1 ELSE 0 END) AS total_aprobados,
          -- Contamos como rechazados los que tengan score menor a 8 o estén explícitamente descartados
          SUM(CASE WHEN perf.score_global < 8 OR perf.score_global IS NULL THEN 1 ELSE 0 END) AS total_rechazados
        FROM Postulaciones post
        LEFT JOIN PerfilPostulante perf ON post.idPostulacion = perf.idPostulacion
        GROUP BY post.idPuesto
      ) counts ON counts.idPuesto = p.idPuesto

      WHERE ce.idEmpresa = ${companyId}
        AND p.Activo = 1
        AND p.aprobada = 1;
    `;
  }
}