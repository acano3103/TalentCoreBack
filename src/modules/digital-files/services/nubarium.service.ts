import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CurpRenapoResult, NubariumStandardResult } from '../interfaces/nubarium.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrismaClient } from 'generated/prisma/client';

@Injectable()
export class NubariumService {
    private readonly logger = new Logger(NubariumService.name);

    // Expresión regular para validar CURP
    private readonly CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]{2}$/i;

    // Mapas de Configuración heredados de Python
    private readonly PAYLOAD_FIELD_MAP: Record<string, string> = {
        ine: 'id',
        ife: 'id',
        identificacion: 'id',
        pasaporte: 'id',
        __default__: 'document',
    };

    private readonly ENDPOINT_MAP: Record<string, string> = {
        ine: 'https://ocr.nubarium.com/ocr/v1/obtener_datos_id',
        ife: 'https://ocr.nubarium.com/ocr/v1/obtener_datos_id',
        identificacion: 'https://ocr.nubarium.com/ocr/v1/obtener_datos_id',
        pasaporte: 'https://ocr.nubarium.com/ocr/v1/obtener_datos_id',
        curp: '/mx/renapo/curp-pdf',
        nss: '/mx/imss/nss-pdf',
        comprobante: '/mx/documents/ocr',
        domicilio: '/mx/documents/ocr',
        acta: '/mx/documents/ocr',
        acta_nacimiento: '/mx/documents/ocr',
        __default__: '/mx/documents/ocr',
    };

    constructor(private readonly configService: ConfigService) { }

    /**
     * 1. Consulta CURP en RENAPO vía Nubarium (Solo texto)
     */
    async consultarCurpRenapo(curp: string): Promise<CurpRenapoResult> {
        const curpLimpia = (curp || '').trim().toUpperCase();

        const resultado: CurpRenapoResult = {
            success: false,
            nombre: '',
            primerApellido: '',
            segundoApellido: '',
            http_status: 0,
            respuesta_json: {},
            error: null,
        };

        if (!this.CURP_REGEX.test(curpLimpia)) {
            resultado.error = 'CURP con formato inválido.';
            return resultado;
        }

        const { username, password, timeout } = this.getCredentials();
        const url = 'https://curp.nubarium.com/renapo/v3/valida_curp';

        try {
            const resp = await axios.post(
                url,
                { curp: curpLimpia },
                {
                    auth: { username, password },
                    timeout: timeout * 1000,
                    // Nota: verify=False en Python equivale a ignorar rechazos de SSL en Node si fuera necesario, 
                    // pero por seguridad es mejor dejar que Node lo valide de fábrica.
                },
            );

            resultado.http_status = resp.status;
            const data = resp.data;
            resultado.respuesta_json = data;

            if (resp.status === 200) {
                const estatus = (data?.estatus || '').toUpperCase();
                const codigoMsg = String(data?.codigoMensaje || '');

                if (codigoMsg === '-1') {
                    resultado.error = 'Límite de consultas RENAPO excedido. Intenta más tarde.';
                    this.logger.warn(`Nubarium RENAPO límite excedido para CURP ${curpLimpia}`);
                    return resultado;
                }

                if (estatus === 'OK') {
                    const nombre = (data?.nombres || data?.nombre || '').trim().toUpperCase();
                    const paterno = (data?.primerApellido || data?.paterno || '').trim().toUpperCase();
                    const materno = (data?.segundoApellido || data?.materno || '').trim().toUpperCase();

                    if (nombre || paterno) {
                        resultado.success = true;
                        resultado.nombre = nombre;
                        resultado.primerApellido = paterno;
                        resultado.segundoApellido = materno;
                    } else {
                        resultado.error = 'RENAPO respondió OK pero sin datos de nombre.';
                    }
                } else {
                    resultado.error = data?.mensaje || data?.message || data?.error || 'CURP no encontrada en RENAPO.';
                }
            } else {
                resultado.error = data?.mensaje || data?.message || data?.error || `Error HTTP ${resp.status} al consultar RENAPO.`;
            }
        } catch (error: any) {
            resultado.http_status = error.response?.status || 503;
            resultado.respuesta_json = error.response?.data || { error: error.message };
            resultado.error = error.response?.data?.mensaje || `Error de conexión con Nubarium RENAPO: ${error.message}`;
            this.logger.error(`Error conexión Nubarium RENAPO CURP: ${error.message}`);
        }

        return resultado;
    }

    /**
     * 2. Función Principal: Validar Documento en Nubarium (OCR + Lista Nominal)
     */
    async validarDocumentoNubarium(
        prisma: PrismaService,
        fileBuffer: Buffer,
        campoNormalizado: string,
        idEmpleado: number,
        idDocumento: number,
        nombreArchivo: string,
        rutaRelativaBd: string,
        usuario: string,
    ): Promise<NubariumStandardResult> {
        const { baseUrl, username, password, timeout } = this.getCredentials();

        const endpoint = this.getEndpoint(campoNormalizado);
        const urlCompleta = endpoint.startsWith('http://') || endpoint.startsWith('https://')
            ? endpoint
            : `${baseUrl}${endpoint}`;

        const resultado: NubariumStandardResult = {
            validado: false,
            score: null,
            motivo_rechazo: null,
            http_status: 0,
            respuesta_json: {},
            endpoint: urlCompleta,
            error_infraestructura: false,
        };

        try {
            // Conversión del buffer a base64 string puros sin saltos de línea
            const b64Contenido = fileBuffer.toString('base64');
            const payloadKey = this.getPayloadField(campoNormalizado);
            const payload = { [payloadKey]: b64Contenido };

            const resp = await axios.post(urlCompleta, payload, {
                auth: { username, password },
                timeout: timeout * 1000,
            });

            resultado.http_status = resp.status;
            const data = resp.data;
            resultado.respuesta_json = data;

            if (resp.status === 200) {
                let estatusOk =
                    (data?.status || '').toUpperCase() === 'OK' ||
                    (data?.estatus || '').toUpperCase() === 'OK' ||
                    !!data?.valid ||
                    !!data?.ok ||
                    ['success', 'ok', 'valid'].includes(data?.status) ||
                    (typeof data?.result === 'object' && data?.result?.valid);

                // Fallback del script de Python para endpoints que devuelven extracción directa sin flag explícito
                if (!estatusOk && data && typeof data === 'object' && !data.error && !data.message) {
                    estatusOk = true;
                }

                resultado.validado = !!estatusOk;

                // Extraer score/confidence
                const scoreRaw = data?.confidence ?? data?.score ?? data?.result?.confidence;
                if (scoreRaw !== undefined && scoreRaw !== null) {
                    resultado.score = parseFloat(Number(scoreRaw).toFixed(4));
                }

                if (!resultado.validado) {
                    resultado.motivo_rechazo = data?.message || data?.mensaje || data?.error || data?.details || 'Documento no válido según Nubarium';
                }

                // ── Paso Extra: Si es INE/IFE y pasó el OCR, validar Lista Nominal ──
                if (resultado.validado && this.esCampoIne(campoNormalizado)) {
                    const payloadNominal = this.construirPayloadValidaIne(data);
                    if (payloadNominal) {
                        const resNominal = await this.validarIneListaNominal(prisma, payloadNominal, idEmpleado, idDocumento, usuario);

                        if (!resNominal.validado && !resNominal.error_infraestructura) {
                            resultado.validado = false;
                            resultado.motivo_rechazo = resNominal.motivo_rechazo;
                        } else if (resNominal.error_infraestructura) {
                            this.logger.warn(`Error de infra en valida_ine para '${nombreArchivo}': ${resNominal.motivo_rechazo}`);
                        }
                    } else {
                        this.logger.log(`INE '${nombreArchivo}' sin campos suficientes para lista nominal. Solo OCR aplicado.`);
                    }
                }
            } else {
                this.setInfraestructuraError(resultado, resp.status, data?.message || data?.error || `[INFRA] Error HTTP ${resp.status}`);
            }
        } catch (error: any) {
            const status = error.response?.status || 503;
            const dataError = error.response?.data || { error: error.message };
            const msg = error.code === 'ECONNABORTED'
                ? `[INFRA] Timeout al conectar con Nubarium — ${urlCompleta}`
                : `[INFRA] Error de conexión con Nubarium: ${error.message}`;

            resultado.http_status = status;
            resultado.respuesta_json = dataError;
            this.setInfraestructuraError(resultado, status, msg);
            this.logger.error(`Error de infraestructura en Nubarium: ${error.message}`);
        } finally {
            // Persistir la bitácora en la Base de Datos compartiendo el contexto de la transacción
            await this.guardarValidacionDb(
                prisma,
                idEmpleado,
                idDocumento,
                nombreArchivo,
                rutaRelativaBd,
                resultado.endpoint,
                resultado.http_status,
                resultado.validado,
                resultado.score,
                resultado.motivo_rechazo,
                resultado.respuesta_json,
                usuario,
            );
        }

        return resultado;
    }

    /**
     * 3. TIPO B: Validar INE contra Lista Nominal
     */
    private async validarIneListaNominal(
        prisma: PrismaService,
        datosIne: any,
        idEmpleado: number,
        idDocumento: number,
        usuario: string,
    ): Promise<Omit<NubariumStandardResult, 'endpoint'>> {
        const { username, password, timeout } = this.getCredentials();
        const url = 'https://ine.nubarium.com/ine/v2/valida_ine';

        const resultado = {
            validado: false,
            score: null as number | null,
            motivo_rechazo: null as string | null,
            http_status: 0,
            respuesta_json: {} as any,
            error_infraestructura: false,
        };

        try {
            const resp = await axios.post(url, datosIne, {
                auth: { username, password },
                timeout: timeout * 1000,
            });

            resultado.http_status = resp.status;
            const data = resp.data;
            resultado.respuesta_json = data;

            if (resp.status === 200) {
                const estatus = (data?.estatus || '').toUpperCase();
                resultado.validado = estatus === 'OK';
                if (!resultado.validado) {
                    resultado.motivo_rechazo = data?.mensaje || data?.message || `INE no válida: estatus=${estatus}`;
                }
            } else {
                resultado.error_infraestructura = true;
                resultado.validado = true; // No bloquear flujo por caídas de infraestructura externa
                resultado.motivo_rechazo = `[INFRA] Error HTTP ${resp.status} en valida_ine`;
            }
        } catch (error: any) {
            resultado.error_infraestructura = true;
            resultado.validado = true; // Tolerancia a fallos de infraestructura
            resultado.http_status = error.response?.status || 503;
            resultado.respuesta_json = error.response?.data || { error: error.message };
            resultado.motivo_rechazo = `[INFRA] Conexión fallida valida_ine: ${error.message}`;
        } finally {
            await this.guardarValidacionDb(
                prisma,
                idEmpleado,
                idDocumento,
                '[lista_nominal]',
                '',
                url,
                resultado.http_status,
                resultado.validado,
                resultado.score,
                resultado.motivo_rechazo,
                resultado.respuesta_json,
                usuario,
            );
        }

        return resultado;
    }

    // ── MÉTODOS AUXILIARES DE SOPORTE ──────────────────────────────────────────

    private getCredentials() {
        return {
            baseUrl: this.configService.get<string>('NUBARIUM_BASE_URL', 'https://api.nubarium.com'),
            username: this.configService.get<string>('NUBARIUM_USERNAME', ''),
            password: this.configService.get<string>('NUBARIUM_PASSWORD', ''),
            timeout: this.configService.get<number>('NUBARIUM_TIMEOUT', 30),
        };
    }

    private getEndpoint(campo: string): string {
        const lower = campo.toLowerCase();
        for (const key of Object.keys(this.ENDPOINT_MAP)) {
            if (key !== '__default__' && lower.includes(key)) return this.ENDPOINT_MAP[key];
        }
        return this.ENDPOINT_MAP.__default__;
    }

    private getPayloadField(campo: string): string {
        const lower = campo.toLowerCase();
        for (const key of Object.keys(this.PAYLOAD_FIELD_MAP)) {
            if (key !== '__default__' && lower.includes(key)) return this.PAYLOAD_FIELD_MAP[key];
        }
        return this.PAYLOAD_FIELD_MAP.__default__;
    }

    private esCampoIne(campo: string): boolean {
        const lower = campo.toLowerCase();
        return ['ine', 'ife', 'identificacion'].some((k) => lower.includes(k));
    }

    private setInfraestructuraError(res: NubariumStandardResult, status: number, msg: string) {
        res.error_infraestructura = true;
        res.validado = true; // Regla de negocio original: Errores de API externa no bloquean la subida
        res.motivo_rechazo = msg;
    }

    private construirPayloadValidaIne(dataOcr: any): any | null {
        const subTipo = (dataOcr?.subTipo || '').toUpperCase();

        if (subTipo === 'C') {
            const claveElector = dataOcr?.claveElector;
            const numeroEmision = dataOcr?.emision || dataOcr?.numeroEmision;
            const ocr = dataOcr?.ocr;
            if (claveElector && numeroEmision) {
                const p: any = { claveElector, numeroEmision: String(numeroEmision) };
                if (ocr) p.ocr = ocr;
                return p;
            }
        } else if (subTipo === 'D') {
            const cic = dataOcr?.cic;
            const ocr = dataOcr?.ocr;
            if (cic) {
                const p: any = { cic: String(cic) };
                if (ocr) p.ocr = ocr;
                return p;
            }
        } else if (['E', 'F', 'G', 'H'].includes(subTipo)) {
            const cic = dataOcr?.cic;
            const identificadorCiudadano = dataOcr?.identificadorCiudadano;
            if (cic && identificadorCiudadano) {
                return { cic: String(cic), identificadorCiudadano: String(identificadorCiudadano) };
            }
        }
        return null;
    }

    /**
     * Ejecuta el Stored Procedure `SpInsNubariumValidacion` usando queryRaw de Prisma
     */
    private async guardarValidacionDb(
        prisma: PrismaService,
        idEmpleado: number,
        idDocumento: number,
        nombreArchivo: string,
        rutaArchivo: string,
        endpoint: string,
        httpStatus: number,
        validado: boolean,
        score: number | null,
        motivoRechazo: string | null,
        respuestaJson: any,
        usuario: string,
    ): Promise<void> {
        try {
            const jsonStr = JSON.stringify(respuestaJson);
            const flagValidado = validado ? 1 : 0;

            // Inyección segura llamando al SP mediante el contexto de transacción inyectado tx
            await prisma.$executeRaw`
        CALL SpInsNubariumValidacion(
          ${idEmpleado},
          ${idDocumento},
          ${nombreArchivo},
          ${rutaArchivo},
          ${endpoint},
          ${httpStatus},
          ${flagValidado},
          ${score},
          ${motivoRechazo},
          ${jsonStr},
          ${usuario},
          @p_idValidacion
        );
      `;
        } catch (err: any) {
            this.logger.error(`Error guardando validación Nubarium en BD: ${err.message}`, err.stack);
        }
    }
}