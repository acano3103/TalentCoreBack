import { PrismaClient } from "generated/prisma/client";

export async function findAllInterviews(companyId: number, positionId: number | undefined, prisma: PrismaClient) {
  let result: any;
  if (positionId !== undefined) {
    result = prisma.$queryRaw`
            SELECT 
                e.id,
                e.title,
                e.description,
                e.modality,
                e.interview_type,
                e.duration,
                e.interviewer_name,
                CAST(COUNT(ep.id) AS SIGNED) AS interviews_programed,
                p.idPuesto AS position_id,
                p.NombrePuesto AS position_name,
                a.Descripcion AS area_name
            FROM Entrevistas e
            INNER JOIN CatPuestos p 
                ON e.position_id = p.idPuesto
            INNER JOIN CatAreas a 
                ON e.area_id = a.idArea
            LEFT JOIN EntrevistasPostulantes ep
                ON ep.interview_id = e.id
            WHERE p.aprobada = true
            AND e.active = true
            AND p.idEmpresa = ${companyId}
            AND e.position_id = ${positionId}
            GROUP BY e.id, e.title, e.description, e.modality, e.duration, e.interviewer_name, p.idPuesto, p.NombrePuesto, a.Descripcion;
        `;
  } else {
    result = prisma.$queryRaw`
        SELECT 
            e.id,
            e.title,
            e.description,
            e.modality,
            e.interview_type,
            e.duration,
            e.interviewer_name,
            CAST(COUNT(ep.id) AS SIGNED) AS interviews_programed,
            p.idPuesto AS position_id,
            p.NombrePuesto AS position_name,
            a.Descripcion AS area_name
        FROM Entrevistas e
        INNER JOIN CatPuestos p 
            ON e.position_id = p.idPuesto
        INNER JOIN CatAreas a 
            ON e.area_id = a.idArea
        LEFT JOIN EntrevistasPostulantes ep
            ON ep.interview_id = e.id
        WHERE p.aprobada = true
        AND e.active = true
        AND p.idEmpresa = ${companyId}
        GROUP BY e.id, e.title, e.description, e.modality, e.duration, e.interviewer_name, p.idPuesto, p.NombrePuesto, a.Descripcion;
    `;
  }

  return result.then((data: any[]) => data.map((item: any) => ({
    ...item,
    interviews_programed: Number(item.interviews_programed),
  })));
}

export async function findAllInterviewsByPostulant(postulantUuid: string, prisma: PrismaClient) {
  return prisma.$queryRaw`
    SELECT 
      ep.id,
      ep.interview_id,
      ep.scheduled_at,
      ep.duration,
      ce.descripcion AS status,

      -- meeting básico
      ep.meeting_url,
      JSON_UNQUOTE(JSON_EXTRACT(ep.metadata, '$.joinUrl')) AS joinUrl,

      -- info entrevista
      e.title,
      e.modality,
      e.interviewer_name,

      -- provider
      cip.name AS provider_name,

      -- resultado resumido
      er.final_score

    FROM EntrevistasPostulantes ep

    INNER JOIN Entrevistas e 
      ON ep.interview_id = e.id

    LEFT JOIN Integraciones i
      ON i.providerId = e.provider_id 
      AND i.idEmpresa = e.company_id

    LEFT JOIN CatIntegracionesProvedores cip
      ON cip.id = i.providerId

    LEFT JOIN EntrevistasResultados er
      ON er.interview_postulant_id = ep.id

    LEFT JOIN CatEstatusEntrevista ce
      ON ce.idEstatusEntrevista = ep.status_id

    WHERE ep.candidate_uuid = ${postulantUuid}

    ORDER BY ep.scheduled_at DESC
  `;
}

export async function findInterviewDetail(interviewPostulantId: string, prisma: PrismaClient) {
  return prisma.$queryRaw`
    SELECT 
      ep.id,
      ep.candidate_uuid,
      ep.interview_id,
      ep.scheduled_at,
      ep.duration,
      ce.descripcion AS status,
      ep.meeting_id,
      ep.meeting_url,
      ep.location,

      -- metadata limpio
      JSON_UNQUOTE(JSON_EXTRACT(ep.metadata, '$.joinUrl')) AS joinUrl,
      JSON_UNQUOTE(JSON_EXTRACT(ep.metadata, '$.password')) AS password,

      -- entrevista principal
      e.modality,
      e.title,
      e.description,
      e.interviewer_name,

      -- provider
      cip.name AS provider_name,

      -- resultados
      er.final_score,
      er.general_report,
      er.strengths,
      er.improvement_areas,
      er.recommendations,

      -- postulante
      CONCAT(p.nombre, ' ', p.primerApellido, ' ', p.segundoApellido) AS postulant_name,
      p.correo as email,
      p.telefono as phone,
      
      -- puesto
      cp.NombrePuesto AS position_name,

      -- Metadata 
      ep.metadata as interview_metadata,
      er.metadata as results_metadata,

      -- criterios + preguntas
      (
        SELECT COALESCE(JSON_ARRAYAGG(
          JSON_OBJECT(
            'criterio_id', ece.id,
            'name', ec.name,
            'description', ec.description,
            'max_score', ec.max_score,
            'weight', ec.weight,
            'order', ec.order,
            'score', ece.score,
            'comments', ece.comment,
            'questions', (
              SELECT COALESCE(JSON_ARRAYAGG(
                JSON_OBJECT(
                  'id', cp.id,
                  'question', cp.question,
                  'expected_answer', cp.expected_answer
                )
              ), JSON_ARRAY())
              FROM CriterioPreguntas cp
              WHERE cp.criterio_id = ec.id
            )
          )
        ), JSON_ARRAY())
        FROM EntrevistasCriterios ec
        LEFT JOIN EntrevistaCriteriosEvaluacion ece 
          ON ece.criterio_id = ec.id
          AND ece.interview_postulant_id = ep.id
        WHERE ec.interview_id = e.id
      ) AS criterios

    FROM EntrevistasPostulantes ep

    INNER JOIN Entrevistas e 
      ON ep.interview_id = e.id

    LEFT JOIN Integraciones i
      ON i.providerId = e.provider_id 
      AND i.idEmpresa = e.company_id

    LEFT JOIN CatIntegracionesProvedores cip
      ON cip.id = i.providerId

    LEFT JOIN EntrevistasResultados er
      ON er.interview_postulant_id = ep.id

    LEFT JOIN CatEstatusEntrevista ce
      ON ce.idEstatusEntrevista = ep.status_id

    LEFT JOIN Postulaciones p
      ON p.uuid = ep.candidate_uuid

    LEFT JOIN CatPuestos cp
      ON cp.idPuesto = e.position_id

    WHERE ep.id = ${interviewPostulantId}
  `;
}

export async function findProgrammedInterviews(companyId: number, mainInterviewId: string, prisma: PrismaClient) {
  // La consulta SQL con LEFT JOIN garantiza que si existe la fila en 'Entrevistas', 
  // se traerá aunque las tablas de la derecha (postulantes) sean nulas.
  const rows: any[] = await prisma.$queryRaw`
        SELECT 
            e.id,
            e.company_id,
            e.area_id,
            e.position_id,
            e.provider_id,
            e.agent_id,
            e.description,
            e.interview_type,
            e.modality,
            e.title,
            e.duration,
            e.interviewer_name,
            e.comment,

            -- Puesto y área
            cp.NombrePuesto AS position_name,
            a.Descripcion AS area_name,

            -- EntrevistasPostulantes (usamos ep_id para validar existencia)
            ep.id AS ep_id,
            ep.candidate_uuid,
            ep.interview_id,
            ep.scheduled_at,
            ep.duration AS ep_duration,
            ep.status_id,
            ep.meeting_id,
            ep.meeting_url,
            ep.location AS ep_location,

            -- Status del postulante
            ce.descripcion AS status,

            -- Datos del Candidato
            CONCAT(p.nombre, ' ', p.primerApellido, ' ', p.segundoApellido) AS candidate_name,
            p.correo AS candidate_email

        FROM Entrevistas e

        LEFT JOIN CatPuestos cp 
            ON e.position_id = cp.idPuesto

        LEFT JOIN CatAreas a 
            ON e.area_id = a.idArea

        LEFT JOIN EntrevistasPostulantes ep
            ON ep.interview_id = e.id

        LEFT JOIN CatEstatusEntrevista ce
            ON ce.idEstatusEntrevista = ep.status_id

        LEFT JOIN Postulaciones p
            ON p.uuid = ep.candidate_uuid

        WHERE 
            e.company_id = ${companyId}
            AND e.id = ${mainInterviewId}
            AND e.active = true;
    `;

  if (rows.length === 0) return [];

  const interviewsMap = new Map();

  for (const row of rows) {
    // Si la entrevista principal aún no está en el mapa, la agregamos
    if (!interviewsMap.has(row.id)) {
      interviewsMap.set(row.id, {
        id: row.id,
        title: row.title,
        description: row.description,
        duration: row.duration,
        interview_type: row.interview_type,
        modality: row.modality,
        interviewer_name: row.interviewer_name,
        comment: row.comment,
        position_name: row.position_name,
        area_name: row.area_name,
        // Se inicializa siempre como un array vacío
        EntrevistasPostulantes: []
      });
    }

    // Solo si existe un ID de postulante (ep_id), lo agregamos al array
    // Si no hay postulantes, 'ep_id' será null por el LEFT JOIN y no entrará aquí
    if (row.ep_id) {
      interviewsMap.get(row.id).EntrevistasPostulantes.push({
        id: row.ep_id,
        scheduled_at: row.scheduled_at,
        status: row.status,
        meeting_id: row.meeting_id,
        meeting_url: row.meeting_url,
        location: row.ep_location,
        candidate_name: row.candidate_name,
        candidate_email: row.candidate_email
      });
    }
  }

  return Array.from(interviewsMap.values());
}