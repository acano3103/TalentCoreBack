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
      ep.status,

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
      ep.status,
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

      -- criterios + preguntas
      (
        SELECT COALESCE(JSON_ARRAYAGG(
          JSON_OBJECT(
            'criterio_id', ec.id,
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

    WHERE ep.id = ${interviewPostulantId}
  `;
}