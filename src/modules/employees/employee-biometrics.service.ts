import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { IntegrationsFactory } from '../integrations/providers/factory.service';
import { ArtemisProvider } from '../integrations/providers/workforce-management/artemis/artemis.provider';
import { ZkBioCreatePersonRequest } from '../integrations/providers/workforce-management/artemis/interfaces/artemis.interface';
import { CreateBiometricPersonDto } from './dto/create-biometric-person.dto';
import { buildDepartmentBranch } from './utils/biometric-departments.util';

// Código del catálogo CatIntegracionesProvedores para la integración de biométricos (ZkBio Integration API)
export const BIOMETRIC_PROVIDER_CODE = 'ZKBIO';

// Estatus de ZKBio que indica que la persona ya quedó registrada
const ESTATUS_ACTIVO = 'Active';

// Foto recibida por multer (en memoria; no se guarda en disco)
export interface BiometricPhotoUpload {
    buffer: Buffer;
    size: number;
    originalname?: string;
    mimetype?: string;
}

// Límite de ZKBio para la foto del rostro
export const MAX_FOTO_ROSTRO_BYTES = 5 * 1024 * 1024;

// Tipo real de la imagen por su contenido (no por la extensión ni por lo que diga el navegador)
const detectarTipoImagen = (buffer: Buffer): 'image/jpeg' | 'image/png' | null => {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    return null;
};

// Fecha de BD (columna DATE) a "YYYY-MM-DD" como la espera ZKBio
const toIsoDate = (fecha?: Date | null): string | null => (fecha ? new Date(fecha).toISOString().slice(0, 10) : null);

// Lógica de biométricos del empleado (alta en el biométrico, rostro y huellas).
// Las llamadas a la API externa viven en ArtemisProvider; aquí solo va la lógica del empleado.
@Injectable()
export class EmployeeBiometricsService {
    private readonly logger = new Logger(EmployeeBiometricsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly integrationFactory: IntegrationsFactory,
    ) { }

    private getTenantOrThrow(activeUser: ActiveUserDto): number {
        if (!activeUser?.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        return activeUser.idTenant;
    }

    // Integración de biométricos activa de la empresa, solo si la empresa es del tenant del usuario
    private findBiometricIntegration(idTenant: number, companyId: number) {
        return this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatEmpresas: { idTenant },
                CatIntegracionesProvedores: {
                    code: BIOMETRIC_PROVIDER_CODE,
                    isActive: true,
                },
            },
        });
    }

    // Busca la integración de biométricos activa de la empresa (del mismo tenant) y regresa su proveedor
    private async getBiometricProvider(activeUser: ActiveUserDto, companyId: number): Promise<ArtemisProvider> {
        const idTenant = this.getTenantOrThrow(activeUser);
        const integracion = await this.findBiometricIntegration(idTenant, companyId);

        if (!integracion) {
            throw new BadRequestException('La empresa no cuenta con la integración de biométricos activa.');
        }

        return this.integrationFactory.getProvider(integracion.providerId);
    }

    // Departamentos de la rama de la empresa (filtrados por el departamento padre configurado al conectar)
    private async getCompanyDepartments(provider: ArtemisProvider, companyId: number) {
        const padre = await provider.getBiometricParentDepartment(companyId);
        if (!padre) {
            throw new BadRequestException('Falta configurar el departamento padre de la empresa en ZKBio. Desconecta y vuelve a conectar Biométricos ZKBio capturando su ID.');
        }
        const departamentos = await provider.getBiometricDepartments(companyId);
        return buildDepartmentBranch(departamentos, padre.externalId);
    }

    // Empleado de la empresa y del tenant del usuario
    private async getEmployeeOrThrow(idTenant: number, companyId: number, employeeId: number) {
        const empleado = await this.prisma.empleados.findFirst({
            where: { idEmpleado: employeeId, idEmpresa: companyId, idTenant },
            select: {
                idEmpleado: true,
                numeroEmpleado: true,
                nombre: true,
                primerApellido: true,
                segundoApellido: true,
                correo: true,
                telefonoMovil: true,
                fechaNacimiento: true,
                fechaIngreso: true,
                activo: true,
            },
        });
        if (!empleado) throw new NotFoundException('El empleado no existe en esta empresa.');
        return empleado;
    }

    // Datos obligatorios del expediente para darlo de alta en ZKBio
    private getMissingData(empleado: { numeroEmpleado: string | null; nombre: string | null; primerApellido: string | null }) {
        const faltantes: string[] = [];
        if (!empleado.numeroEmpleado?.trim()) faltantes.push('Número de empleado');
        if (!empleado.nombre?.trim()) faltantes.push('Nombre');
        if (!empleado.primerApellido?.trim()) faltantes.push('Primer apellido');
        return faltantes;
    }

    // Catálogo de departamentos del biométrico (solo la rama de la empresa)
    async getDepartments(activeUser: ActiveUserDto, companyId: number) {
        const provider = await this.getBiometricProvider(activeUser, companyId);
        return this.getCompanyDepartments(provider, companyId);
    }

    // Catálogo de niveles de acceso del biométrico (opcional al dar de alta a una persona)
    async getAccessLevels(activeUser: ActiveUserDto, companyId: number) {
        const provider = await this.getBiometricProvider(activeUser, companyId);
        return provider.getBiometricAccessLevels(companyId);
    }

    // Estado biométrico del empleado: datos que se enviarán, si la integración está conectada y su registro en ZKBio
    async getEmployeeBiometrics(activeUser: ActiveUserDto, companyId: number, employeeId: number) {
        const idTenant = this.getTenantOrThrow(activeUser);
        const empleado = await this.getEmployeeOrThrow(idTenant, companyId, employeeId);
        const integracion = await this.findBiometricIntegration(idTenant, companyId);
        let registro = await this.prisma.empleadosBiometricos.findFirst({
            where: { idEmpleado: employeeId, idEmpresa: companyId, idTenant },
        });

        let departamentoPadre: { externalId: string; name: string | null } | null = null;
        if (integracion) {
            const provider: ArtemisProvider = await this.integrationFactory.getProvider(integracion.providerId);
            departamentoPadre = await provider.getBiometricParentDepartment(companyId);

            // El alta en ZKBio puede quedar en proceso (202): se refresca el estatus mientras no esté activo
            if (registro?.personId && registro.estatus !== ESTATUS_ACTIVO) {
                try {
                    const persona = await provider.getBiometricPerson(companyId, registro.personId);
                    if (persona?.status && persona.status !== registro.estatus) {
                        registro = await this.prisma.empleadosBiometricos.update({
                            where: { idEmpleadoBiometrico: registro.idEmpleadoBiometrico },
                            data: { estatus: persona.status },
                        });
                    }
                } catch (error) {
                    this.logger.warn(`No se pudo refrescar el estatus biométrico del empleado ${employeeId}: ${(error as Error).message}`);
                }
            }
        }

        return {
            empleado: {
                idEmpleado: empleado.idEmpleado,
                numeroEmpleado: empleado.numeroEmpleado,
                nombreCompleto: [empleado.nombre, empleado.primerApellido, empleado.segundoApellido].filter(Boolean).join(' '),
                correo: empleado.correo,
                telefonoMovil: empleado.telefonoMovil,
                fechaNacimiento: toIsoDate(empleado.fechaNacimiento),
                fechaIngreso: toIsoDate(empleado.fechaIngreso),
                activo: empleado.activo,
            },
            datosFaltantes: this.getMissingData(empleado),
            integracion: { conectada: !!integracion, departamentoPadre },
            registro: registro
                ? {
                    personId: registro.personId,
                    externalId: registro.externalId,
                    estatus: registro.estatus,
                    departmentExternalId: registro.departmentExternalId,
                    accessLevelExternalIds: registro.accessLevelExternalIds,
                    fechaAlta: registro.fechaAlta,
                    fechaRostro: registro.fechaRostro,
                    fechaHuellas: registro.fechaHuellas,
                    huellasDedos: registro.huellasDedos,
                }
                : null,
        };
    }

    // Da de alta al empleado en ZKBio (POST /persons) y guarda la relación en EmpleadosBiometricos
    async registerEmployee(activeUser: ActiveUserDto, companyId: number, employeeId: number, dto: CreateBiometricPersonDto) {
        const idTenant = this.getTenantOrThrow(activeUser);
        const empleado = await this.getEmployeeOrThrow(idTenant, companyId, employeeId);

        if (!empleado.activo) throw new BadRequestException('El empleado no está activo.');
        const faltantes = this.getMissingData(empleado);
        if (faltantes.length > 0) {
            throw new BadRequestException(`Completa en el expediente: ${faltantes.join(', ')}.`);
        }

        const existente = await this.prisma.empleadosBiometricos.findUnique({ where: { idEmpleado: employeeId } });
        if (existente?.personId) throw new ConflictException('El empleado ya está dado de alta en el biométrico.');

        const externalId = empleado.numeroEmpleado!.trim();
        const otro = await this.prisma.empleadosBiometricos.findFirst({
            where: { idEmpresa: companyId, externalId, idEmpleado: { not: employeeId } },
        });
        if (otro) throw new ConflictException(`El número de empleado ${externalId} ya está registrado en el biométrico para otro empleado.`);

        const provider = await this.getBiometricProvider(activeUser, companyId);

        // El departamento debe pertenecer a la rama de la empresa (no solo se filtra en pantalla)
        const departmentExternalId = dto.departmentExternalId.trim();
        const departamentos = await this.getCompanyDepartments(provider, companyId);
        if (!departamentos.some((d) => d.departmentExternalId === departmentExternalId)) {
            throw new BadRequestException('El departamento seleccionado no pertenece a esta empresa en ZKBio.');
        }

        // Niveles de acceso: los elegidos o, si no se envían, los marcados como iniciales en ZKBio
        let accessLevelExternalIds = [...new Set((dto.accessLevelExternalIds ?? []).map((a) => a.trim()).filter(Boolean))];
        if (accessLevelExternalIds.length === 0) {
            const niveles = await provider.getBiometricAccessLevels(companyId);
            accessLevelExternalIds = niveles.filter((n) => n.isInitial && n.accessLevelExternalId).map((n) => n.accessLevelExternalId!);
        }

        const persona: ZkBioCreatePersonRequest = {
            externalId,
            employeeNumber: externalId,
            firstName: empleado.nombre!.trim(),
            lastName: [empleado.primerApellido, empleado.segundoApellido].map((a) => a?.trim()).filter(Boolean).join(' '),
            departmentExternalId,
            email: empleado.correo?.trim() || null,
            mobilePhone: empleado.telefonoMovil?.trim() || null,
            accessProfileExternalId: null,
            accessLevelExternalIds,
            birthday: toIsoDate(empleado.fechaNacimiento),
            hireDate: toIsoDate(empleado.fechaIngreso),
        };

        // Misma llave para reintentos del mismo día: ZKBio no duplica a la persona
        const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const idempotencyKey = `talentcore-${idTenant}-${employeeId}-${hoy}`;

        let creada;
        try {
            creada = await provider.createBiometricPerson(companyId, persona, idempotencyKey);
        } catch (error) {
            if (error instanceof ConflictException) {
                throw new ConflictException(
                    `${error.message}. Puede que esta persona ya exista en el biométrico (por ejemplo, si se registró directo en ZKBio). Revisa con soporte antes de reintentar.`,
                );
            }
            throw error;
        }

        if (!creada?.personId) {
            throw new BadRequestException('ZKBio no devolvió el identificador de la persona. Intenta de nuevo.');
        }

        const ahora = new Date();
        const datos = {
            idTenant,
            idEmpresa: companyId,
            personId: creada.personId,
            externalId,
            estatus: creada.status ?? null,
            departmentExternalId,
            accessLevelExternalIds,
            fechaAlta: ahora,
            usuarioRegistro: `${activeUser.first_name ?? ''} ${activeUser.last_name ?? ''}`.trim() || String(activeUser.id),
        };

        const registro = await this.prisma.$transaction(async (tx) => {
            const guardado = await tx.empleadosBiometricos.upsert({
                where: { idEmpleado: employeeId },
                create: { idEmpleado: employeeId, ...datos },
                update: datos,
            });
            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: companyId,
                    accion: 'CREATE',
                    tablaOrigen: 'EmpleadosBiometricos',
                    idRegistro: String(guardado.idEmpleadoBiometrico),
                    descripcion: `Empleado #${employeeId} (${externalId}) dado de alta en el biométrico ZKBio (departamento ${departmentExternalId}) por ${activeUser.first_name} ${activeUser.last_name}`,
                    fechaCreacion: ahora,
                },
            });
            return guardado;
        });

        return {
            message: 'Empleado dado de alta en el biométrico.',
            personId: registro.personId,
            estatus: registro.estatus,
        };
    }

    // Sube la foto del rostro del empleado a ZKBio (el empleado ya debe estar dado de alta). La foto no se guarda en TalentCore.
    async uploadFace(activeUser: ActiveUserDto, companyId: number, employeeId: number, foto?: BiometricPhotoUpload) {
        const idTenant = this.getTenantOrThrow(activeUser);
        await this.getEmployeeOrThrow(idTenant, companyId, employeeId);

        const registro = await this.prisma.empleadosBiometricos.findFirst({
            where: { idEmpleado: employeeId, idEmpresa: companyId, idTenant },
        });
        if (!registro?.personId) throw new BadRequestException('Primero da de alta al empleado en el biométrico.');

        if (!foto?.buffer?.length) throw new BadRequestException('Selecciona una foto del rostro.');
        if (foto.size > MAX_FOTO_ROSTRO_BYTES) throw new BadRequestException('La foto no debe pesar más de 5 MB.');
        const tipo = detectarTipoImagen(foto.buffer);
        if (!tipo) throw new BadRequestException('La foto debe ser una imagen JPG o PNG.');

        const provider = await this.getBiometricProvider(activeUser, companyId);
        try {
            await provider.uploadBiometricFace(companyId, registro.personId, {
                buffer: foto.buffer,
                mimetype: tipo,
                filename: `rostro-${registro.externalId}.${tipo === 'image/png' ? 'png' : 'jpg'}`,
            });
        } catch (error) {
            // 422 de ZKBio (FaceNotDetected, InvalidBiometricData): se agrega cómo tomar una mejor foto
            if (error instanceof UnprocessableEntityException) {
                throw new UnprocessableEntityException(`${error.message} — Usa una foto de frente, con buena luz y sin lentes oscuros ni gorra.`);
            }
            throw error;
        }

        const ahora = new Date();
        await this.prisma.$transaction(async (tx) => {
            await tx.empleadosBiometricos.update({
                where: { idEmpleadoBiometrico: registro.idEmpleadoBiometrico },
                data: { fechaRostro: ahora },
            });
            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: companyId,
                    accion: 'UPDATE',
                    tablaOrigen: 'EmpleadosBiometricos',
                    idRegistro: String(registro.idEmpleadoBiometrico),
                    descripcion: `Rostro del empleado #${employeeId} (${registro.externalId}) ${registro.fechaRostro ? 'actualizado' : 'registrado'} en el biométrico ZKBio por ${activeUser.first_name} ${activeUser.last_name}`,
                    fechaCreacion: ahora,
                },
            });
        });

        return { message: 'Rostro registrado en el biométrico.', fechaRostro: ahora };
    }
}
