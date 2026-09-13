import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { IArtemisProvider } from "./interfaces/artemis.interface";
import { PrismaService } from "src/prisma/prisma.service";
import { EncryptionService } from "src/common/utils/encryption.util";
import axios, { AxiosError } from "axios";
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
        const { apiKey } = dto;

        const isConnected = await this.prisma.integraciones.findFirst({
            where: { idEmpresa: companyId, providerId: providerId, isConnected: true }
        });
        if (isConnected) throw new BadRequestException('Artemis ya está conectado');

        await this.prisma.$transaction(async (tx) => {
            await tx.integraciones.create({
                data: {
                    idEmpresa: companyId,
                    providerId: providerId,
                    isConnected: true,
                    metadata: {
                        apiKey: this.encryptionService.encrypt(apiKey),
                    }
                }
            });
        });

        return { message: 'Artemis conectado exitosamente' };
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

            return { message: 'Artemis desconectado exitosamente' };
        } catch (error) {
            throw new BadRequestException('Error al desconectar Artemis');
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
            modalidad: schedule.Modalidad.toUpperCase(),
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
}