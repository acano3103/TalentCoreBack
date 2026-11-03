import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { IArtemisProvider, ZkBioAccessLevel, ZkBioCreatePersonRequest, ZkBioDepartment, ZkBioError, ZkBioFacePhoto, ZkBioFingerprint, ZkBioParentDepartment, ZkBioPerson } from "./interfaces/artemis.interface";
import { PrismaService } from "src/prisma/prisma.service";
import { EncryptionService } from "src/common/utils/encryption.util";
import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { formatTimeToHHMMSS, mapDayToArtemisId } from "./helpers/artemis.helper";

@Injectable()
export class ArtemisProvider implements IArtemisProvider {
    private readonly logger = new Logger(ArtemisProvider.name);
    private readonly artemisBaseUrl = process.env.ARTEMIS_BASE_URL;

    constructor(
        private prisma: PrismaService,
        private encryptionService: EncryptionService
    ) { }

    async connect(companyId: number, providerId: number, dto: any): Promise<any> {
        const proveedor = await this.prisma.catIntegracionesProvedores.findUnique({ where: { id: providerId } });
        const nombreProveedor = proveedor?.name ?? 'Artemis';
        // Biométricos (ZKBIO): la key se guarda sin espacios al inicio o al final
        const apiKey: string = proveedor?.code === 'ZKBIO' ? dto.apiKey?.trim() : dto.apiKey;

        const isConnected = await this.prisma.integraciones.findFirst({
            where: { idEmpresa: companyId, providerId: providerId, isConnected: true }
        });
        if (isConnected) throw new BadRequestException(`${nombreProveedor} ya está conectado`);

        // Biométricos (ZKBIO): se valida la API key y el departamento padre (rama de la empresa en ZKBio) antes de guardarlos
        let metadataExtra: Record<string, unknown> = {};
        if (proveedor?.code === 'ZKBIO') {
            if (!apiKey) throw new BadRequestException('Captura la API key de biométricos.');
            const departamentoPadreId = String(dto.departamentoPadreExternalId ?? '').trim();
            if (!departamentoPadreId) throw new BadRequestException('Captura el ID del departamento padre de la empresa en ZKBio.');

            const departamentos = await this.validateZkBioApiKey(apiKey);
            const padre = departamentos.find((d) => String(d.departmentExternalId) === departamentoPadreId);
            if (!padre) throw new BadRequestException(`El departamento padre ${departamentoPadreId} no existe en ZKBio.`);

            metadataExtra = { departamentoPadre: { externalId: departamentoPadreId, name: padre.name ?? null } };
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.integraciones.create({
                data: {
                    idEmpresa: companyId,
                    providerId: providerId,
                    isConnected: true,
                    metadata: {
                        apiKey: this.encryptionService.encrypt(apiKey),
                        ...metadataExtra,
                    }
                }
            });
        });

        return { message: `${nombreProveedor} conectado exitosamente` };
    }

    async disconnect(companyId: number, providerId: number) {
        const proveedor = await this.prisma.catIntegracionesProvedores.findUnique({ where: { id: providerId } });
        const nombreProveedor = proveedor?.name ?? 'Artemis';

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

            return { message: `${nombreProveedor} desconectado exitosamente` };
        } catch (error) {
            throw new BadRequestException(`Error al desconectar ${nombreProveedor}`);
        }
    }

    async syncSingleEmployee(companyId: number, employee: any) {
        const integracion = await this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatIntegracionesProvedores: {
                    code: 'ARTEMIS'
                }
            },
            include: { CatIntegracionesProvedores: true }
        });

        if (!integracion) throw new BadRequestException('Artemis no está configurado o conectado para esta empresa.');

        // Desencriptar las credenciales
        const metadata = integracion.metadata as any;
        const apiKey = this.encryptionService.decrypt(metadata.apiKey);

        // 2. Construir el payload según el contrato de Artemis POST /api/v1/users
        const loginUser = employee.email?.split('@')[0] || `user_${employee.externalEmployeeId}`;

        const mapGenderToArtemis = (internalGenderId?: number | null): number => {
            switch (internalGenderId) {
                case 1: // MASCULINO
                    return 2; // HOMBRE en Artemis
                case 2: // FEMENINO
                    return 4; // MUJER en Artemis
                default:
                    return 6; // 3 (NO BINARIO), 4 (GENERO FLUIDO), 5, 6, 7, 8 o null/undefined van a NO BINARIO
            }
        };

        const formattedSchedules = (employee.schedules || []).map((schedule: any) => ({
            diaId: mapDayToArtemisId(schedule.DiaSemana),
            horaInicio: formatTimeToHHMMSS(schedule.HoraEntrada),
            horaFin: formatTimeToHHMMSS(schedule.HoraSalida),
            modalidad: schedule.Modalidad?.toUpperCase() ?? 'PRESENCIAL',
        }));

        const payload = {
            externalUserId: String(employee.externalEmployeeId),
            nombre: employee.name?.trim() || '',
            apellidoPaterno: employee.lastName?.trim() || '',
            apellidoMaterno: employee.motherLastName?.trim() || '',
            horarioExternoId: '', // ?
            email: employee.email?.trim() || '',
            login: loginUser,
            idRol: 8,
            idGrupo: 104,
            idEmpresa: companyId, // ?
            usuarioData: {
                rfc: employee.rfc || '',
                curp: employee.curp || '',
                nss: employee.nss || '',
                codigoPostalRfc: employee.address?.codigoPostal || '',
                fechaIngreso: employee.startDate ? new Date(employee.startDate).toISOString() : new Date().toISOString(),
                idSexo: mapGenderToArtemis(employee.idGenero),
                idPuestoExterno: 26, // ?
                fechaAltaImss: new Date().toISOString(), // ?
                idEstatusImss: 1, // ?
                fechaNacimiento: employee.birthDate ? new Date(employee.birthDate).toISOString() : new Date().toISOString(),
                curpValidado: !!employee.curp // 
            },
            nomina: {
                idBanca: 0,
                idBanca2: 0,
                cuentaBanco: employee.bankDetails?.cuentaBancaria ?? '',
                clabeBanco: employee.bankDetails?.banco ?? '',
                sueldoMensualNomina: employee.salaryInfo?.salarioBruto ?? 0,
                salarioDiario: 0,
                sueldoHora: 0,
                netoMensual: employee.salaryInfo?.salarioNeto ?? 0,
                bono: employee.salaryInfo?.bono ?? 0,
                diasPeriodo: 15,
                diasRetroactivosTrabajados: 0,
                bonoProductividadTeamLider: 0,
                bonoProductividad: 0,
                descuentoQnalInfonavit: 0,
                idModalidad: 1,
                idEstatus: 1
            },
            horarios: formattedSchedules
        };

        // Consumir el endpoint de Artemis
        try {
            const url = `${this.artemisBaseUrl}/api/v1/users`;

            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                },
                timeout: 10000,
            });

            const artemisId = response.data?.data?.id;

            if (!artemisId) {
                throw new Error('La respuesta de Artemis no devolvió un ID de usuario válido.');
            }

            return { artemisUserId: String(artemisId) };
        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError<any>;
                const detail = axiosError.response?.data?.message || axiosError.response?.data?.detail || axiosError.message;
                this.logger.error(`Error en Artemis API (${axiosError.response?.status}): ${JSON.stringify(axiosError.response?.data)}`);
                throw new BadRequestException(`Fallo al sincronizar con Artemis: ${detail}`);
            }

            throw new BadRequestException(error.message || 'Error inesperado al conectar con Artemis');
        }
    }

    // ===== Biométricos ZKBio (ZkBio Integration API) =====
    // La API key es por empresa: integración ZKBIO en Integraciones (metadata.apiKey encriptada).
    // La URL base es la misma para todos: ZKBIO_BASE_URL en el .env.

    // Catálogo de departamentos del biométrico
    async getBiometricDepartments(companyId: number): Promise<ZkBioDepartment[]> {
        return this.zkBioRequest<ZkBioDepartment[]>(companyId, { method: 'GET', url: '/departments' });
    }

    // Catálogo de niveles de acceso del biométrico
    async getBiometricAccessLevels(companyId: number): Promise<ZkBioAccessLevel[]> {
        return this.zkBioRequest<ZkBioAccessLevel[]>(companyId, { method: 'GET', url: '/access-levels' });
    }

    // Departamento padre de la empresa en ZKBio (se captura al conectar): delimita qué departamentos puede usar
    async getBiometricParentDepartment(companyId: number): Promise<ZkBioParentDepartment | null> {
        const integracion = await this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatIntegracionesProvedores: { code: 'ZKBIO' }
            }
        });
        const padre = (integracion?.metadata as any)?.departamentoPadre;
        if (!padre?.externalId) return null;
        return { externalId: String(padre.externalId), name: padre.name ?? null };
    }

    // Da de alta a la persona en ZKBio (POST /persons). La Idempotency-Key evita duplicados al reintentar.
    async createBiometricPerson(companyId: number, person: ZkBioCreatePersonRequest, idempotencyKey: string): Promise<ZkBioPerson> {
        return this.zkBioRequest<ZkBioPerson>(companyId, {
            method: 'POST',
            url: '/persons',
            data: person,
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        });
    }

    // Consulta a la persona en ZKBio (estatus del alta)
    async getBiometricPerson(companyId: number, personId: string): Promise<ZkBioPerson> {
        return this.zkBioRequest<ZkBioPerson>(companyId, { method: 'GET', url: `/persons/${encodeURIComponent(personId)}` });
    }

    // Sube la foto del rostro de la persona (PUT /persons/{personId}/face, multipart campo "photo", JPG o PNG, máx. 5 MB).
    // La foto solo se reenvía a ZKBio: no se guarda en TalentCore.
    async uploadBiometricFace(companyId: number, personId: string, photo: ZkBioFacePhoto): Promise<void> {
        const form = new FormData();
        form.append('photo', new Blob([new Uint8Array(photo.buffer)], { type: photo.mimetype }), photo.filename);

        await this.zkBioRequest<unknown>(companyId, {
            method: 'PUT',
            url: `/persons/${encodeURIComponent(personId)}/face`,
            data: form,
            timeout: 30000,
        });
    }

    // Envía las plantillas de huella de la persona (PUT /persons/{personId}/fingerprints).
    // Las plantillas las genera el agente ZKTeco en la PC del lector; aquí solo se transportan (no se guardan ni se loguean).
    async uploadBiometricFingerprints(companyId: number, personId: string, fingerprints: ZkBioFingerprint[]): Promise<void> {
        await this.zkBioRequest<unknown>(companyId, {
            method: 'PUT',
            url: `/persons/${encodeURIComponent(personId)}/fingerprints`,
            data: { fingerprints },
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
        });
    }

    private getZkBioBaseUrl(): string {
        const baseUrl = process.env.ZKBIO_BASE_URL?.trim().replace(/\/+$/, '');
        if (!baseUrl) throw new ServiceUnavailableException('Falta configurar ZKBIO_BASE_URL en el servidor.');
        return baseUrl;
    }

    // Obtiene la API key de biométricos de la empresa (integración ZKBIO conectada)
    private async getZkBioApiKey(companyId: number): Promise<string> {
        const integracion = await this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatIntegracionesProvedores: { code: 'ZKBIO' }
            }
        });

        if (!integracion) throw new BadRequestException('Biométricos ZKBio no está configurado o conectado para esta empresa.');

        const metadata = integracion.metadata as any;
        if (!metadata?.apiKey) throw new BadRequestException('La integración de biométricos no tiene API key guardada.');

        return this.encryptionService.decrypt(metadata.apiKey);
    }

    // Al conectar: valida la API key consultando el catálogo de departamentos (también sirve para validar el padre)
    private async validateZkBioApiKey(apiKey: string): Promise<ZkBioDepartment[]> {
        try {
            const response = await axios.get<ZkBioDepartment[]>(`${this.getZkBioBaseUrl()}/departments`, {
                headers: { 'X-Api-Key': apiKey },
                timeout: 10000,
            });
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            throw this.toZkBioException(error);
        }
    }

    // Llamada a la ZkBio Integration API con la API key de la empresa
    private async zkBioRequest<T>(companyId: number, config: AxiosRequestConfig): Promise<T> {
        const apiKey = await this.getZkBioApiKey(companyId);

        try {
            const response = await axios.request<T>({
                ...config,
                baseURL: this.getZkBioBaseUrl(),
                timeout: config.timeout ?? 15000,
                headers: { ...(config.headers as Record<string, string> | undefined), 'X-Api-Key': apiKey },
            });
            return response.data;
        } catch (error) {
            throw this.toZkBioException(error);
        }
    }

    // Traduce los errores de la API ({ code, message, correlationId }) a excepciones de Nest.
    // Nunca se loguean la API key ni los datos biométricos.
    private toZkBioException(error: unknown): HttpException {
        if (error instanceof HttpException) return error;
        if (!axios.isAxiosError(error)) {
            this.logger.error(`Error inesperado en ZkBio API: ${(error as Error)?.message}`);
            return new ServiceUnavailableException('Error inesperado al conectar con el servicio de biométricos.');
        }

        const axiosError = error as AxiosError<ZkBioError>;
        const status = axiosError.response?.status;
        const body = axiosError.response?.data;
        const correlationId = body?.correlationId ?? axiosError.response?.headers?.['x-correlation-id'];
        const ref = correlationId ? ` (ref: ${correlationId})` : '';
        const detail = body?.message || body?.code || axiosError.message;

        this.logger.error(`Error en ZkBio API (${status ?? axiosError.code}): ${body?.code ?? ''} ${detail}${ref}`);

        if (!status) return new ServiceUnavailableException(`No se pudo conectar con el servicio de biométricos. Intenta de nuevo.${ref}`);
        if (status === 401) return new BadRequestException(`La API key de biométricos es inválida o fue revocada.${ref}`);
        if (status === 404) return new NotFoundException(`Biométricos: ${detail}${ref}`);
        if (status === 409) return new ConflictException(`Biométricos: ${detail}${ref}`);
        if (status === 400 || status === 422) return new UnprocessableEntityException(`Biométricos: ${detail}${ref}`);
        if (status >= 500) return new ServiceUnavailableException(`El servicio de biométricos no está disponible. Intenta de nuevo.${ref}`);
        return new BadRequestException(`Biométricos: ${detail}${ref}`);
    }
}