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
            console.log("Resumen extraído del CV--------------", extractedData);

            const summaryText = extractedData.resumen || 'Resumen no disponible.';
            console.log("Resumen optimizado del CV--------------", summaryText);

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
            console.log("Evaluación estructurada de la IA--------------", aiEvaluationResult);

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
}