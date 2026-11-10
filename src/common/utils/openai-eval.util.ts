import OpenAI from 'openai'

interface VacancyCriterion {
    id: string
    interview_id: string
    name: string
    description: string
    max_score: number
    weight: number
    order: number
}

interface CriterionScore {
    criterionId: string
    points: number
    feedback: string
}

interface InterviewEvaluationResult {
    overallScore: number
    isApt: boolean
    criterionScores: CriterionScore[]
    candidateSummary: string
    recruiterReport: string
    recommendations?: string
    alternativePosition?: string
    trainingCourses?: string
    strengths: string
    areasForImprovement: string
}

export async function analyzeInterviewWithOpenAI(
    apiKey: string,
    vacancyTitle: string,
    vacancyDescription: string,
    vacancyRequirements: string,
    interviewScript: string,
    minScore: number,
    duration: number,
    criteria: VacancyCriterion[],
    transcription?: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<InterviewEvaluationResult> {

    const openai = new OpenAI({
        apiKey,
    });

    // Construir el prompt
    let prompt = `Eres un evaluador experto de recursos humanos. Analiza la siguiente entrevista de trabajo y proporciona una evaluación detallada para determinar si el candidato es apto para el puesto.

PUESTO: ${vacancyTitle}
DESCRIPCIÓN DEL PUESTO: ${vacancyDescription}
REQUISITOS DEL PUESTO: ${vacancyRequirements}
DURACIÓN DE LA ENTREVISTA: ${duration} segundos (${Math.floor(duration / 60)} minutos y ${duration % 60} segundos)
PUNTUACIÓN MÍNIMA REQUERIDA: ${minScore}%

SCRIPT DE LA ENTREVISTA (comportamiento del entrevistador IA):
${interviewScript}

`

    if (transcription && transcription.trim()) {
        prompt += `TRANSCRIPCIÓN REAL DE LA ENTREVISTA:
${transcription}

IMPORTANTE: Analiza la transcripción real de la entrevista. Evalúa:
1. El conocimiento y experiencia del candidato según los requisitos del puesto
2. Las habilidades técnicas y blandas demostradas
3. La comunicación y claridad en las respuestas
4. La actitud y profesionalismo
5. El ajuste cultural y motivación
6. La capacidad de resolución de problemas`
    } else if (conversationHistory && conversationHistory.length > 0) {
        const conversationText = conversationHistory
            .map(msg => `${msg.role === 'user' ? 'Candidato' : 'Entrevistador'}: ${msg.content}`)
            .join('\n')

        prompt += `HISTORIAL DE CONVERSACIÓN:
${conversationText}

IMPORTANTE: Analiza el historial de la conversación. Evalúa:
1. El conocimiento y experiencia del candidato según los requisitos del puesto
2. Las habilidades técnicas y blandas demostradas
3. La comunicación y claridad en las respuestas
4. La actitud y profesionalismo
5. El ajuste cultural y motivación`
    } else {
        const durationAssessment = duration < 300 ? 'relativamente corta' : duration > 900 ? 'relativamente larga' : 'apropiada'
        prompt += `IMPORTANTE: Como no tienes acceso a la transcripción real de la entrevista, debes generar una evaluación estimada basada en:
1. Los requisitos del puesto
2. La duración de la entrevista (${duration} segundos es ${durationAssessment})
3. El tipo de puesto y su complejidad
`
    }

    // Construir lista de criterios de evaluación con IDs
    const sortedCriteria = criteria.sort((a, b) => a.order - b.order)
    const criteriaList = sortedCriteria
        .map((c, index) => `${index + 1}. [ID: ${c.id}] ${c.name} (Valor máximo: ${c.max_score} puntos)${c.description ? ` - ${c.description}` : ''}`)
        .join('\n')

    const criteriaExample = sortedCriteria
        .map((c) => `    {
      "criterionId": "${c.id}",
      "points": 0,
      "feedback": "Evalúa si el candidato cumple con: ${c.name}"
    }`)
        .join(',\n')

    const totalMaxPoints = criteria.reduce((sum, c) => sum + c.max_score, 0)

    prompt += `
CRITERIOS DE EVALUACIÓN ESPECÍFICOS (DEBES EVALUAR TODOS):
${criteriaList}

TOTAL MÁXIMO DE PUNTOS: ${totalMaxPoints}
PUNTUACIÓN MÍNIMA REQUERIDA: ${minScore}%

INSTRUCCIONES CRÍTICAS PARA LA EVALUACIÓN:
1. Debes evaluar CADA UNO de los ${criteria.length} criterios listados arriba - NO OMITAS NINGUNO
2. Para cada criterio, analiza la transcripción/historial COMPLETA y determina si el candidato cumple con ese criterio específico
3. Busca evidencia específica en la conversación (palabras, frases, experiencias mencionadas)
4. Asigna puntos de 0 a [valor máximo del criterio] según el cumplimiento
5. Proporciona feedback específico para cada criterio
6. NO omitas ningún criterio - todos deben estar en el array criterionScores

DETERMINACIÓN DE APTITUD:
- Si la puntuación general es >= ${minScore}%: El candidato ES APTO para el puesto
- Si la puntuación general es < ${minScore}%: El candidato NO ES APTO para el puesto

RECOMENDACIONES ESPECÍFICAS:
1. Si el candidato NO ES APTO:
   - Genera "alternativePosition": Sugiere otras posiciones/áreas donde el candidato podría tener mejor desempeño basándote en sus fortalezas identificadas
   - Genera "recommendations": Recomendaciones generales de mejora

2. Si el candidato ES APTO pero necesita reforzamiento (puntuación entre ${minScore}% y ${minScore + 10}%):
   - Genera "trainingCourses": Lista específica de cursos o capacitaciones que el candidato debería tomar para mejorar su perfil
   - Genera "recommendations": Recomendaciones específicas de desarrollo

3. Si el candidato ES APTO y tiene buena puntuación (>= ${minScore + 10}%):
   - Genera "recommendations": Recomendaciones de integración y desarrollo continuo
   - NO generes "alternativePosition" ni "trainingCourses" (o déjalos como null)

GENERA:
1. Una puntuación general calculada como: (suma de puntos obtenidos / total máximo de puntos) * 100
2. Un booleano "isApt" que indica si cumple con el perfil (puntuación >= ${minScore}%)
3. Un resumen para el candidato (máximo 200 palabras) - NO se mostrará al candidato, solo para referencia interna
4. Un reporte detallado para el reclutador (máximo 500 palabras) con análisis profundo
5. Fortalezas identificadas
6. Áreas de mejora
7. Recomendaciones, posición alternativa y cursos según corresponda

Responde SOLO con un JSON válido en este formato exacto (INCLUYE TODOS LOS CRITERIOS):
{
  "overallScore": 75.5,
  "isApt": true,
  "criterionScores": [
${criteriaExample}
  ],
  "candidateSummary": "Resumen breve para el candidato...",
  "recruiterReport": "Reporte detallado para reclutador...",
  "recommendations": "Recomendaciones específicas...",
  "alternativePosition": null,
  "trainingCourses": "Curso 1, Curso 2...",
  "strengths": "Fortalezas identificadas...",
  "areasForImprovement": "Áreas de mejora..."
}

⚠️ IMPORTANTE: 
- El array criterionScores DEBE contener exactamente ${criteria.length} elementos
- "isApt" debe ser true si overallScore >= ${minScore}, false en caso contrario
- Si isApt es false, DEBES proporcionar "alternativePosition"
- Si isApt es true pero overallScore < ${minScore + 10}, DEBES proporcionar "trainingCourses"
`

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Eres un evaluador experto de recursos humanos. Siempre respondes con JSON válido.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.7,
            response_format: { type: 'json_object' },
        })

        const response = completion.choices[0]?.message?.content
        if (!response) {
            throw new Error('No response from OpenAI')
        }

        console.log('📝 Respuesta de OpenAI (entrevista):', response.substring(0, 500) + '...')

        const evaluation = JSON.parse(response) as any

        // Validar y ajustar scores de criterios
        if (evaluation.criterionScores && Array.isArray(evaluation.criterionScores)) {
            const receivedScoresMap = new Map<string, CriterionScore>(
                evaluation.criterionScores.map((cs: any) => [cs.criterionId, cs as CriterionScore])
            )

            evaluation.criterionScores = sortedCriteria.map((criterion) => {
                const receivedScore = receivedScoresMap.get(criterion.id)

                if (receivedScore) {
                    const points = Math.max(0, Math.min(receivedScore.points || 0, criterion.max_score))
                    return {
                        criterionId: criterion.id,
                        points,
                        feedback: receivedScore.feedback || `Evaluado: ${criterion.name}`,
                    }
                } else {
                    console.warn(`⚠️ No se recibió score para criterio: ${criterion.id} - ${criterion.name}`)
                    return {
                        criterionId: criterion.id,
                        points: 0,
                        feedback: `No se encontró evidencia de cumplimiento para: ${criterion.name}`,
                    }
                }
            })
        } else {
            console.warn('⚠️ No se recibió array criterionScores, creando scores por defecto')
            evaluation.criterionScores = sortedCriteria.map((c) => ({
                criterionId: c.id,
                points: 0,
                feedback: `No se pudo evaluar este criterio: ${c.name}`,
            }))
        }

        // Calcular overallScore si no está presente
        const totalPoints = evaluation.criterionScores.reduce(
            (sum: number, cs: CriterionScore) => sum + cs.points,
            0
        )
        evaluation.overallScore = totalMaxPoints > 0
            ? (totalPoints / totalMaxPoints) * 100
            : 0

        evaluation.overallScore = Math.max(0, Math.min(100, evaluation.overallScore))

        // Asegurar isApt basado en minScore
        evaluation.isApt = evaluation.overallScore >= minScore

        // Campos obligatorios en Prisma (String no null). El modelo a veces omite o envía null.
        const need = (v: unknown, fallback: string) =>
            typeof v === 'string' && v.trim() ? v.trim() : fallback
        evaluation.candidateSummary = need(
            evaluation.candidateSummary,
            'Sin resumen disponible.'
        )
        evaluation.recruiterReport = need(
            evaluation.recruiterReport,
            'Sin informe para reclutador.'
        )
        evaluation.strengths = need(
            evaluation.strengths,
            'No se identificaron fortalezas claras en la entrevista.'
        )
        evaluation.areasForImprovement = need(
            evaluation.areasForImprovement,
            'No especificado.'
        )

        return evaluation as InterviewEvaluationResult
    } catch (error) {
        console.error('Error en análisis de entrevista con OpenAI:', error)

        // Retornar evaluación por defecto
        return {
            overallScore: 0,
            isApt: false,
            criterionScores: criteria.map((c) => ({
                criterionId: c.id,
                points: 0,
                feedback: 'Error al evaluar este criterio. Se requiere revisión manual.',
            })),
            candidateSummary: 'La evaluación se está procesando. Se requiere revisión manual.',
            recruiterReport: 'Error al generar el reporte detallado. Se requiere revisión manual.',
            recommendations: 'Revisar la grabación de la entrevista manualmente.',
            alternativePosition: 'Revisar manualmente para determinar posición alternativa.',
            trainingCourses: 'Revisar manualmente para determinar cursos recomendados.',
            strengths: 'No disponible en este momento.',
            areasForImprovement: 'No disponible en este momento.',
        }
    }
}
