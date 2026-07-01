import { Prisma, PrismaClient } from "generated/prisma/client";

const VACANCY_APPROVED_STATUS = 5; // APROBADO RH

export async function findAllInterviews(
  companyId: number,
  vacancyId: number | undefined,
  search: string,
  skip: number,
  limit: number,
  prisma: PrismaClient
) {
  const vacancyFilter = vacancyId !== undefined
    ? Prisma.sql`AND e.idVacante = ${vacancyId}`
    : Prisma.empty;

  const searchFilter = search
    ? Prisma.sql`
        AND (
          e.title LIKE ${`%${search}%`}
          OR p.NombrePuesto LIKE ${`%${search}%`}
        )
      `
    : Prisma.empty;

  const result: any[] = await prisma.$queryRaw`
    SELECT 
        e.id,
        e.title,
        e.description,
        e.modality,
        e.interview_type,
        e.duration,
        e.interviewer_name,
        CAST(COUNT(ep.id) AS SIGNED) AS interviews_programed,
        v.idVacante AS vacancy_id,
        p.NombrePuesto AS vacancy_name,
        a.Descripcion AS area_name
    FROM Entrevistas e
    INNER JOIN Vacantes v 
        ON e.idVacante = v.idVacante
    INNER JOIN CatPuestos p 
        ON v.idPuesto = p.idPuesto
    INNER JOIN CatAreas a 
        ON e.area_id = a.idArea
    LEFT JOIN EntrevistasPostulantes ep
        ON ep.interview_id = e.id
    WHERE v.idEstatusVacante = ${VACANCY_APPROVED_STATUS}
    AND e.active = true
    AND v.idEmpresa = ${companyId}
    ${vacancyFilter}
    ${searchFilter}
    GROUP BY e.id, e.title, e.description, e.modality, e.duration, e.interviewer_name, v.idVacante, p.NombrePuesto, a.Descripcion
    ORDER BY e.id DESC
    LIMIT ${limit}
    OFFSET ${skip}
  `;

  return result.map((item: any) => ({
    ...item,
    interviews_programed: Number(item.interviews_programed),
    has_scheduled_candidates: Number(item.interviews_programed) > 0,
  }));
}

export async function countInterviews(
  companyId: number,
  vacancyId: number | undefined,
  search: string,
  prisma: PrismaClient
): Promise<number> {
  const vacancyFilter = vacancyId !== undefined
    ? Prisma.sql`AND e.idVacante = ${vacancyId}`
    : Prisma.empty;

  const searchFilter = search
    ? Prisma.sql`
        AND (
          e.title LIKE ${`%${search}%`}
          OR p.NombrePuesto LIKE ${`%${search}%`}
        )
      `
    : Prisma.empty;

  const result: { total: bigint }[] = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT e.id) AS total
    FROM Entrevistas e
    INNER JOIN Vacantes v 
        ON e.idVacante = v.idVacante
    INNER JOIN CatPuestos p 
        ON v.idPuesto = p.idPuesto
    WHERE v.idEstatusVacante = ${VACANCY_APPROVED_STATUS}
    AND e.active = true
    AND v.idEmpresa = ${companyId}
    ${vacancyFilter}
    ${searchFilter}
  `;

  return Number(result[0].total);
}

export async function findAllInterviewsByPostulant(postulantUuid: string, prisma: PrismaClient) {
  return prisma.$queryRaw`
    SELECT 
      ep.id,
      ep.interview_id,
      ep.scheduled_at,
      ep.duration,
      ce.descripcion AS status,
      ep.meeting_url,
      JSON_UNQUOTE(JSON_EXTRACT(ep.metadata, '$.joinUrl')) AS joinUrl,
      e.title,
      e.modality,
      e.interviewer_name,
      cip.name AS provider_name,
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
      JSON_UNQUOTE(JSON_EXTRACT(ep.metadata, '$.joinUrl')) AS joinUrl,
      JSON_UNQUOTE(JSON_EXTRACT(ep.metadata, '$.password')) AS password,
      e.modality,
      e.title,
      e.description,
      e.interviewer_name,
      cip.name AS provider_name,
      er.final_score,
      er.general_report,
      er.strengths,
      er.improvement_areas,
      er.recommendations,
      CONCAT(p.nombre, ' ', p.primerApellido, ' ', p.segundoApellido) AS postulant_name,
      p.correo as email,
      p.telefono as phone,
      cp.NombrePuesto AS vacancy_name,
      ep.metadata as interview_metadata,
      er.metadata as results_metadata,
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
                  'id', cp2.id,
                  'question', cp2.question,
                  'expected_answer', cp2.expected_answer
                )
              ), JSON_ARRAY())
              FROM CriterioPreguntas cp2
              WHERE cp2.criterio_id = ec.id
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
    LEFT JOIN Vacantes v
      ON v.idVacante = e.idVacante
    LEFT JOIN CatPuestos cp
      ON cp.idPuesto = v.idPuesto
    WHERE ep.id = ${interviewPostulantId}
  `;
}

export async function findProgrammedInterviews(companyId: number, mainInterviewId: string, prisma: PrismaClient) {
  const rows: any[] = await prisma.$queryRaw`
        SELECT 
            e.id,
            e.company_id,
            e.area_id,
            e.idVacante,
            e.provider_id,
            e.agent_id,
            e.description,
            e.interview_type,
            e.modality,
            e.title,
            e.duration,
            e.interviewer_name,
            e.comment,

            cp.NombrePuesto AS vacancy_name,
            a.Descripcion AS area_name,

            ep.id AS ep_id,
            ep.candidate_uuid,
            ep.interview_id,
            ep.scheduled_at,
            ep.duration AS ep_duration,
            ep.status_id,
            ep.meeting_id,
            ep.meeting_url,
            ep.location AS ep_location,

            ce.descripcion AS status,

            CONCAT(p.nombre, ' ', p.primerApellido, ' ', p.segundoApellido) AS candidate_name,
            p.correo AS candidate_email

        FROM Entrevistas e

        LEFT JOIN Vacantes v
            ON e.idVacante = v.idVacante

        LEFT JOIN CatPuestos cp 
            ON v.idPuesto = cp.idPuesto

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
        vacancy_name: row.vacancy_name,
        area_name: row.area_name,
        EntrevistasPostulantes: []
      });
    }

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


