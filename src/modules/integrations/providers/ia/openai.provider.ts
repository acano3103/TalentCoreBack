import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { PDFParse } from 'pdf-parse';
import { PrismaService } from 'src/prisma/prisma.service';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { IAiProvider } from './interfaces/ai.interface';

@Injectable()
export class OpenAiProvider implements IAiProvider {
    constructor(
        private prisma: PrismaService,
        private encryptionService: EncryptionService
    ) { }

    async connect(companyId: number, providerId: number, dto: any) {
        const { apiKey, defaultModel } = dto;

        try {
            await axios.get('https://api.openai.com/v1/models', {
                headers: { Authorization: `Bearer ${apiKey}` }
            });
        } catch (error) {
            throw new BadRequestException('La API Key de OpenAI es inválida o expiró');
        }

        const isConnected = await this.prisma.integraciones.findFirst({
            where: { idEmpresa: companyId, providerId: providerId, isConnected: true }
        });
        if (isConnected) throw new BadRequestException('OpenAI ya está conectado');

        await this.prisma.$transaction(async (tx) => {
            await tx.integraciones.create({
                data: {
                    idEmpresa: companyId,
                    providerId: providerId,
                    isConnected: true,
                    metadata: {
                        apiKey: this.encryptionService.encrypt(apiKey),
                        defaultModel: defaultModel || 'gpt-4o'
                    }
                }
            });
        });

        return { message: 'OpenAI conectado exitosamente' };
    }

    async disconnect(companyId: number, providerId: number) {
        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.integraciones.delete({
                    where: {
                        idEmpresa_providerId: {
                            idEmpresa: companyId,
                            providerId: providerId
                        }
                    }
                });
            });

            return { message: 'OpenAI desconectado exitosamente' };
        } catch (error) {
            throw new BadRequestException('Error al desconectar OpenAI');
        }
    }

    async generateJobDescription(companyId: number, requirements: any): Promise<string> {
        const integracion = await this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatIntegracionesProvedores: {
                    code: 'OPENAI'
                }
            },
            include: { CatIntegracionesProvedores: true }
        });

        if (!integracion) throw new BadRequestException('OpenAI no está configurado o conectado para esta empresa.');

        // Desencriptar las credenciales
        const metadata = integracion.metadata as any;
        const apiKey = this.encryptionService.decrypt(metadata.apiKey);
        const model = metadata.defaultModel || 'gpt-4o';

        // Crear el mensaje del prompt basado en tu JSON anidado
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: `Eres un experto en Reclutamiento y Selección de Talento Humano. 
                            Tu tarea es redactar una descripción de puesto/vacante altamente atractiva y profesional para ser publicada en bolsas de trabajo.
                            Utiliza un tono corporativo pero moderno. Estructura el resultado usando secciones claras(por ejemplo: Sobre el Puesto, Responsabilidades, Requisitos).
                            No agregues saludos ni comentarios extras, regresa únicamente el texto estructurado de la vacante.`
                        },
                        {
                            role: 'user',
                            content: `Genera la descripción de la vacante utilizando los siguientes datos estructurados del puesto:
                            ${JSON.stringify(requirements, null, 2)}`
                        }
                    ],
                    temperature: 0.7
                },
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Retornar el texto generado por la IA
            return response.data.choices[0].message.content;

        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            throw new BadRequestException(`Error al generar la vacante con OpenAI: ${errorMsg}`);
        }
    }

    async analyzeCV(
        companyId: number,
        postulationId: number,
        vacancyId: number,
        pdfBuffer: Buffer,
        requirements: string,
    ): Promise<any> {
        try {
            // 1. Obtener y desencriptar las credenciales de la empresa
            const integracion = await this.prisma.integraciones.findFirst({
                where: {
                    idEmpresa: companyId,
                    isConnected: true,
                    CatIntegracionesProvedores: { code: 'OPENAI' },
                },
                include: { CatIntegracionesProvedores: true },
            });

            if (!integracion) {
                throw new BadRequestException('OpenAI no está configurado o conectado para esta empresa.');
            }

            const metadata = integracion.metadata as any;
            const apiKey = this.encryptionService.decrypt(metadata.apiKey);
            const model = metadata.defaultModel || 'gpt-4o';

            const headers = {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            };

            // 2. Extracción de Texto del CV real usando PDFParse
            let cvTextoExtraido = '';
            let pdfParser: PDFParse | null = null;
            try {
                pdfParser = new PDFParse({ data: pdfBuffer });
                const parsedPdf = await pdfParser.getText();
                cvTextoExtraido = parsedPdf.text || '';
            } catch (pdfError) {
                throw new InternalServerErrorException(`Error al extraer el texto del PDF: ${pdfError.message}`);
            } finally {
                if (pdfParser) {
                    try {
                        await pdfParser.destroy();
                    } catch (err) {
                        // Ignorar fallas al destruir el parser
                    }
                }
            }

            // ==========================================
            // PROMPT 1: Generación de Resumen Ejecutivo Genérico
            // ==========================================
            const prompt1Response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: model,
                    response_format: { type: 'json_object' }, // Forzamos salida JSON
                    messages: [
                        {
                            role: 'system',
                            content: 'Eres un algoritmo experto en síntesis profesional y análisis de perfiles laborales. Tu salida debe ser única y estrictamente un objeto JSON válido.',
                        },
                        {
                            role: 'user',
                            content: `Analiza el texto del CV provisto y genera un resumen profesional del candidato estructurándolo exactamente bajo el siguiente formato de objeto JSON:
                    
                    {
                      "resumen": "Escribe aquí un resumen ejecutivo conciso del perfil del candidato de 100 palabras o menos. Debe ser fluido, conversacional, profesional y completamente agnóstico al puesto, adaptándose perfectamente tanto a oficios operativos como a profesiones corporativas."
                    }

                    Texto del CV:\n${cvTextoExtraido}`,
                        },
                    ],
                    temperature: 0.2,
                },
                { headers },
            );

            // Parseamos el JSON del resumen
            const extractedData = JSON.parse(prompt1Response.data.choices[0].message.content);
            const summaryText = extractedData.resumen || 'Resumen no disponible.';

            // ==========================================
            // PROMPT 2: Evaluación Comparativa Universal (Texto en Crudo)
            // ==========================================
            const prompt3Response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: model,
                    response_format: { type: 'json_object' },
                    messages: [
                        {
                            role: 'system',
                            content: `Eres un especialista senior en Recursos Humanos experto en evaluación integral de talento humano.
                Tu tarea es realizar una evaluación comparativa estructurada bajo un modelo de scoring enterprise, aplicable con total neutralidad a cualquier tipo de puesto (operativo, de servicios, administrativo, técnico o profesional).
                
                REGLAS CRÍTICAS:
                1. Debes responder ÚNICAMENTE con un objeto JSON válido que siga EXACTAMENTE esta estructura:
                {
                  "estado_proceso": "Evaluado" o "Rechazo automático por dominio no relacionado",
                  "decision": "Avanzar" o "No avanzar",
                  "clasificacion": "A, B o C",
                  "indice_riesgo_contratacion": "Alto", "Medio" o "Bajo",
                  "riesgo_critico": true o false,
                  "requisitos_knockout_detectados": ["lista", "de", "razones"],
                  "fortalezas_clave": ["lista", "de", "fortalezas"],
                  "brechas_criticas": ["lista", "de", "brechas"],
                  "detalle_por_categoria": [
                    {
                      "categoria": "Nombre de la categoría",
                      "criterios": [ { "nivel": "1" | "0.5" | "0.3" | "0" } ],
                      "justificacion": "Explicación breve"
                    }
                  ]
                }
                2. Las categorías en 'detalle_por_categoria' DEBEN ser exactamente estas 5, sin omitir ninguna: "Habilidades Técnicas", "Requisitos Obligatorios", "Experiencia Relevante", "Competencias", "Idiomas".
                   *NOTA DE CONTEXTO GENÉRICO: Evalúa "Habilidades Técnicas" según corresponda al puesto buscado. Para personal operativo (limpieza, cocina, mantenimiento), entiéndase como el manejo de herramientas, maquinaria de trabajo, químicos o destrezas manuales específicas requeridas por la vacante.*
                3. Los niveles de los criterios solo pueden ser strings numéricos: "1" (cumple), "0.5" (parcial), "0.3" (mencionado sin evidencia), "0" (no cumple).
                4. IMPORTANTE: Incluso si decides que el candidato es un "Rechazo automático por dominio no relacionado", DEBES evaluar las 5 categorías obligatoriamente para generar un reporte detallado del por qué fue rechazado.`
                        },
                        {
                            role: 'user',
                            content: `PERFIL BUSCADO (VACANTE):\n${requirements}\n\nDATOS DEL CANDIDATO (TEXTO COMPLETO DEL CV):\n${cvTextoExtraido}`,
                        },
                    ],
                    temperature: 0.1, // Temperatura baja para forzar obediencia estricta a la estructura JSON
                },
                { headers },
            );

            const aiEvaluationResult = JSON.parse(prompt3Response.data.choices[0].message.content);

            // ==========================================
            // 4. PROCESAMIENTO MATEMÁTICO UNIFICADO
            // ==========================================
            const pesos: Record<string, number> = {
                "Habilidades Técnicas": 0.35,
                "Requisitos Obligatorios": 0.25,
                "Experiencia Relevante": 0.20,
                "Competencias": 0.15,
                "Idiomas": 0.05
            };

            const calcularCategoria = (cat: any) => {
                const criterios = cat.criterios || [];
                const niveles = criterios.map((c: any) => parseFloat(c.nivel) || 0);
                const puntos_obtenidos = niveles.reduce((a: number, b: number) => a + b, 0);
                const puntos_posibles = niveles.length;
                const porcentaje = puntos_posibles > 0 ? puntos_obtenidos / puntos_posibles : 0;
                const peso = pesos[cat.categoria] || 0;
                const score_ponderado = porcentaje * peso;

                return {
                    categoria: cat.categoria,
                    puntos_obtenidos,
                    puntos_posibles,
                    porcentaje,
                    score_ponderado,
                    justificacion: cat.justificacion || '',
                    peso: cat.peso_referencial || `${peso * 100}%`
                };
            };

            const detalleCategoriasRaw = aiEvaluationResult.detalle_por_categoria || [];

            let sumaScorePonderado = 0;
            detalleCategoriasRaw.forEach((cat: any) => {
                const calc = calcularCategoria(cat);
                sumaScorePonderado += calc.score_ponderado;
            });

            let scoreGlobal = sumaScorePonderado * 10; // Escala 1-10
            if (aiEvaluationResult.riesgo_critico === true) {
                scoreGlobal *= 0.7; // Penalización del 30% por Knockout
            }
            scoreGlobal = parseFloat(Math.max(scoreGlobal, 1).toFixed(2));

            let sumaTecnico = 0;
            let sumaPesosTecnico = 0;
            let sumaCompetencial = 0;
            let sumaPesosCompetencial = 0;

            const categoriasProcesadas = detalleCategoriasRaw.map((cat: any) => {
                const calc = calcularCategoria(cat);

                if (["Habilidades Técnicas", "Experiencia Relevante"].includes(calc.categoria)) {
                    sumaTecnico += calc.porcentaje * pesos[calc.categoria];
                    sumaPesosTecnico += pesos[calc.categoria];
                }
                if (["Competencias", "Idiomas"].includes(calc.categoria)) {
                    sumaCompetencial += calc.porcentaje * pesos[calc.categoria];
                    sumaPesosCompetencial += pesos[calc.categoria];
                }

                return {
                    categoria: calc.categoria,
                    peso: calc.peso,
                    porcentaje_cumplimiento: parseFloat(calc.porcentaje.toFixed(2)),
                    score_ponderado: parseFloat(calc.score_ponderado.toFixed(2)),
                    justificacion: calc.justificacion
                };
            });

            const indiceTecnico = sumaPesosTecnico > 0 ? parseFloat((sumaTecnico / sumaPesosTecnico).toFixed(2)) : 0;
            const indiceCompetencial = sumaPesosCompetencial > 0 ? parseFloat((sumaCompetencial / sumaPesosCompetencial).toFixed(2)) : 0;

            const indicesFinales = {
                indice_ajuste_tecnico: indiceTecnico,
                indice_ajuste_competencial: indiceCompetencial,
                indice_riesgo_contratacion: aiEvaluationResult.indice_riesgo_contratacion || "Medio"
            };

            // ==========================================
            // 5. INSERCIÓN DE DATOS DIRECTA CON PRISMA ORM
            // ==========================================
            await this.prisma.perfilPostulante.create({
                data: {
                    idPostulacion: postulationId,
                    idVacante: vacancyId,
                    estado_proceso: aiEvaluationResult.estado_proceso || 'Evaluado',
                    score_global: scoreGlobal,
                    clasificacion: aiEvaluationResult.clasificacion || '',
                    decision: aiEvaluationResult.decision || 'Avanzar',
                    indices: JSON.stringify(indicesFinales),
                    detalle_por_categoria: JSON.stringify(categoriasProcesadas),
                    requisitos_knockout: JSON.stringify(aiEvaluationResult.requisitos_knockout_detectados || []),
                    fortalezas_clave: JSON.stringify(aiEvaluationResult.fortalezas_clave || []),
                    brechas_criticas: JSON.stringify(aiEvaluationResult.brechas_criticas || []),
                    resumen: summaryText
                }
            });

            return { status: 'Procesado exitosamente', score_global: scoreGlobal };

        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            throw new InternalServerErrorException(`Error en el motor de análisis de CV: ${errorMsg}`);
        }
    }


async startRoleplayCall(
    companyId: number,
    idTenant: number,
    idRolePlay: number,
    idUsuario: number,
): Promise<{ idLlamada: number; aiMessage: string }> {
    // 1. Obtener y desencriptar las credenciales de la empresa 
    const integracion = await this.prisma.integraciones.findFirst({
        where: {
            idEmpresa: companyId,
            isConnected: true,
            CatIntegracionesProvedores: { code: 'OPENAI' },
        },
        include: { CatIntegracionesProvedores: true },
    });

    if (!integracion) {
        throw new BadRequestException('OpenAI no está configurado o conectado para esta empresa.');
    }

    const metadata = integracion.metadata as any;
    const apiKey = this.encryptionService.decrypt(metadata.apiKey);
    const model = metadata.defaultModel || 'gpt-4o';

    // 2. Buscar el role play y confirmar que existe, pertenece al tenant, y está activo
    const rolePlay = await this.prisma.rolePlays.findFirst({
        where: { idRolePlay, idEmpresa: companyId, idTenant, Activo: true },
    });

    if (!rolePlay) {
        throw new BadRequestException('El role play no existe o no está activo.');
    }

    // 3. Armar el prompt de sistema con el Contexto y AiScript del role play
    const systemPrompt = `Eres un cliente en una simulación de call center para capacitación.
    ESCENARIO: ${rolePlay.Contexto}
    INSTRUCCIONES DE PERSONAJE: ${rolePlay.AiScript}
    Responde de forma natural, breve (máximo 3 oraciones).
    Mantén el tono y personalidad del escenario.
    No menciones que eres una IA.`;

    // 4. Pedirle a OpenAI el primer mensaje del "cliente"
    let aiMessage: string;
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: 'Inicia la conversación como el cliente del escenario. Una sola frase.' },
                ],
                temperature: 0.8,
                max_tokens: 150,
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        aiMessage = response.data.choices[0]?.message?.content?.trim();
        if (!aiMessage) {
            throw new Error('No se recibió respuesta de la IA');
        }
    } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        throw new BadRequestException(`Error al iniciar la sesión con OpenAI: ${errorMsg}`);
    }

    // 5. Crear el registro de la llamada con el historial inicial
    const conversationHistory = [{ role: 'assistant', content: aiMessage }];

    const llamada = await this.prisma.rolePlayLlamadas.create({
        data: {
            idRolePlay,
            idTenant,
            idEmpresa: companyId,
            idUsuario,
            Estatus: 'EN_CURSO',
            HistorialConversacion: conversationHistory,
            FechaInicio: new Date(),
        },
    });

    return { idLlamada: llamada.idLlamada, aiMessage };
}

async processRoleplayTurn(
    companyId: number,
    idTenant: number,
    idLlamada: number,
    agentMessage: string,
): Promise<{ aiMessage: string }> {
    // 1. Buscar la llamada y confirmar que pertenece al tenant/empresa y sigue en curso
    const llamada = await this.prisma.rolePlayLlamadas.findFirst({
        where: { idLlamada, idEmpresa: companyId, idTenant },
        include: { RolePlay: true },
    });

    if (!llamada) {
        throw new BadRequestException('La sesión de práctica no existe.');
    }
    if (llamada.Estatus !== 'EN_CURSO') {
        throw new BadRequestException('La sesión de práctica no está en curso.');
    }

    // 2. Obtener y desencriptar las credenciales (mismo patrón)
    const integracion = await this.prisma.integraciones.findFirst({
        where: {
            idEmpresa: companyId,
            isConnected: true,
            CatIntegracionesProvedores: { code: 'OPENAI' },
        },
        include: { CatIntegracionesProvedores: true },
    });

    if (!integracion) {
        throw new BadRequestException('OpenAI no está configurado o conectado para esta empresa.');
    }

    const metadata = integracion.metadata as any;
    const apiKey = this.encryptionService.decrypt(metadata.apiKey);
    const model = metadata.defaultModel || 'gpt-4o';

    // 3. Recuperar el historial existente (guardado como JSON) y armar el mismo prompt de sistema
    const history = Array.isArray(llamada.HistorialConversacion)
        ? (llamada.HistorialConversacion as Array<{ role: string; content: string }>)
        : [];

    const systemPrompt = `Eres un cliente en una simulación de call center para capacitación.
    ESCENARIO: ${llamada.RolePlay.Contexto}
    INSTRUCCIONES DE PERSONAJE: ${llamada.RolePlay.AiScript}
    Responde de forma natural, breve (máximo 3 oraciones).
    Mantén el tono y personalidad del escenario.
    No menciones que eres una IA.`;

    // 4. Mandar el prompt + TODO el historial + el nuevo mensaje del agente
    let aiMessage: string;
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...history,
                    { role: 'user', content: agentMessage },
                ],
                temperature: 0.8,
                max_tokens: 150,
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        aiMessage = response.data.choices[0]?.message?.content?.trim();
        if (!aiMessage) {
            throw new Error('No se recibió respuesta de la IA');
        }
    } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        throw new BadRequestException(`Error al procesar el turno con OpenAI: ${errorMsg}`);
    }

    // 5. Actualizar el historial guardado con el nuevo intercambio
    const updatedHistory = [
        ...history,
        { role: 'user', content: agentMessage },
        { role: 'assistant', content: aiMessage },
    ];

    await this.prisma.rolePlayLlamadas.update({
        where: { idLlamada },
        data: { HistorialConversacion: updatedHistory },
    });

    return { aiMessage };
}


async evaluateRoleplayCall(
    companyId: number,
    idTenant: number,
    idLlamada: number,
): Promise<{ idEvaluacion: number; scoreGlobal: number }> {
    // 1. Buscar la llamada, confirmando tenant/empresa, que esté finalizada, y traer sus criterios
    const llamada = await this.prisma.rolePlayLlamadas.findFirst({
        where: { idLlamada, idEmpresa: companyId, idTenant },
        include: {
            RolePlay: {
                include: { Criterios: { orderBy: { Orden: 'asc' } } },
            },
        },
    });

    if (!llamada) {
        throw new BadRequestException('La sesión de práctica no existe.');
    }
    if (llamada.Estatus !== 'FINALIZADA') {
        throw new BadRequestException('Solo se pueden evaluar sesiones finalizadas.');
    }

    const evaluacionExistente = await this.prisma.rolePlayEvaluaciones.findUnique({
        where: { idLlamada },
    });
    if (evaluacionExistente) {
        throw new BadRequestException('Esta sesión ya fue evaluada.');
    }

    // 2. Obtener y desencriptar las credenciales (mismo patrón)
    const integracion = await this.prisma.integraciones.findFirst({
        where: {
            idEmpresa: companyId,
            isConnected: true,
            CatIntegracionesProvedores: { code: 'OPENAI' },
        },
        include: { CatIntegracionesProvedores: true },
    });

    if (!integracion) {
        throw new BadRequestException('OpenAI no está configurado o conectado para esta empresa.');
    }

    const metadata = integracion.metadata as any;
    const apiKey = this.encryptionService.decrypt(metadata.apiKey);
    const model = metadata.defaultModel || 'gpt-4o';

    // 3. Armar el prompt de evaluación: escenario + conversación completa + lista de criterios con sus IDs
    const criterios = llamada.RolePlay.Criterios;
    const history = Array.isArray(llamada.HistorialConversacion)
        ? (llamada.HistorialConversacion as Array<{ role: string; content: string }>)
        : [];

    const conversacionTexto = history
        .map((m) => `${m.role === 'user' ? 'Agente' : 'Cliente'}: ${m.content}`)
        .join('\n');

    const criteriosTexto = criterios
        .map((c) => {
            const instruccionTipo =
                c.Tipo === 'BINARIO'
                    ? `Evalúa como 0 (no cumplió) o ${c.PuntosMaximos} (cumplió)`
                    : `Evalúa entre 0 y ${c.PuntosMaximos} proporcional al cumplimiento`;
            return `[ID: ${c.idCriterio}] ${c.Nombre} (máx: ${c.PuntosMaximos} pts, tipo: ${c.Tipo})\nInstrucción: ${c.Descripcion}\n${instruccionTipo}`;
        })
        .join('\n\n');

    const scoreMaximo = criterios.reduce((sum, c) => sum + c.PuntosMaximos, 0);

    const evaluationPrompt = `ROLE PLAY: ${llamada.RolePlay.Titulo}

    CONTEXTO DEL ESCENARIO:
    ${llamada.RolePlay.Contexto}

    CONVERSACIÓN:
    ${conversacionTexto}

    CRITERIOS DE EVALUACIÓN:
    ${criteriosTexto}

    Total máximo de puntos: ${scoreMaximo}

    Responde SOLO con JSON válido:
    {
    "criterionScores": [
        { "criterionId": 0, "score": 0, "feedback": "..." }
    ],
    "agentSummary": "...",
    "supervisorReport": "...",
    "strengths": ["..."],
    "improvements": ["..."],
    "recommendations": ["..."]
    }`;

    // 4. Pedirle a OpenAI la evaluación en formato JSON
    let parsed: any;
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: model,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: 'Eres evaluador experto en call center y ventas. Responde solo JSON.' },
                    { role: 'user', content: evaluationPrompt },
                ],
                temperature: 0.3,
                max_tokens: 2000,
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        const rawContent = response.data.choices[0]?.message?.content;
        if (!rawContent) throw new Error('No se recibió respuesta de la evaluación');
        parsed = JSON.parse(rawContent);
    } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        throw new BadRequestException(`Error al evaluar la sesión con OpenAI: ${errorMsg}`);
    }

    // 5. Procesar y acotar los puntajes que regresó la IA contra los límites reales de cada criterio
    const criterionScores = criterios.map((c) => {
        const gptScore = (parsed.criterionScores || []).find(
            (item: any) => Number(item.criterionId) === c.idCriterio,
        );
        const rawScore = gptScore?.score ?? 0;
        const feedback = gptScore?.feedback ?? 'Sin evaluación disponible para este criterio.';

        let score: number;
        if (c.Tipo === 'BINARIO') {
            score = rawScore > 0 ? c.PuntosMaximos : 0;
        } else {
            score = Math.min(Math.max(rawScore, 0), c.PuntosMaximos);
        }

        return { idCriterio: c.idCriterio, score, feedback };
    });

    const scoreTotal = criterionScores.reduce((sum, item) => sum + item.score, 0);
    const scoreGlobal = scoreMaximo > 0 ? parseFloat(((scoreTotal / scoreMaximo) * 100).toFixed(2)) : 0;

    // 6. Guardar la evaluación y los puntajes por criterio en una transacción
    const idEvaluacion = await this.prisma.$transaction(async (tx) => {
        const evaluacion = await tx.rolePlayEvaluaciones.create({
            data: {
                idLlamada,
                idTenant,
                ScoreGlobal: scoreGlobal,
                ScoreMaximo: scoreMaximo,
                ResumenAgente: parsed.agentSummary || '',
                ReporteSupervisor: parsed.supervisorReport || '',
                Fortalezas: parsed.strengths || [],
                AreasMejora: parsed.improvements || [],
                Recomendaciones: parsed.recommendations || [],
            },
        });

        await tx.rolePlayEvaluacionCriterios.createMany({
            data: criterionScores.map((cs) => ({
                idEvaluacion: evaluacion.idEvaluacion,
                idCriterio: cs.idCriterio,
                idTenant,
                Score: cs.score,
                Feedback: cs.feedback,
            })),
        });

        return evaluacion.idEvaluacion;
    });

    return { idEvaluacion, scoreGlobal };
}

}