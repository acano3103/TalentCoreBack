import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { CommsPayload } from 'src/modules/notifications/interfaces/comms-dispatch.interface';
import { WebsocketGateway } from 'src/modules/notifications/gateways/websockets.gateway';
import { errorComms } from '../comms-http';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { AudienceResolverService } from '../audiences/audience-resolver.service';
import { CriteriosAudiencia, criteriosVacios, normalizarCriterios } from '../audiences/criterios';
import { EffectiveChannelService } from '../channels/effective-channel.service';
import { Canal, normalizarCanales } from '../channels/canales';
import { faltanContenido } from '../announcements/contenido';
import { exigirTransicion } from '../announcements/announcement-state';
import { COLA_ENVIO, COLA_ESCALAMIENTO, LOTE_CONGELAR, LOTE_ENVIO, JobDiferido } from './colas';
import { canalesEscalados, minutosDeEscalamiento, siguienteCanal } from './escalamiento';
import { expiracionEnlace, nuevoTokenEnlace, urlEnlace } from './enlace-seguro';
import { partir } from './lotes';
import { CodigoProveedor, planearCanales } from './plan-canales';
import { resolverPlantillaWhatsApp } from './plantilla-wa';
import { canalesParaEnvio } from './politica-canal';
import { FilaPrecioWa, precioVigente } from './precio-wa';
import { minutosDeReloj } from './silencio';
import { whatsappBloqueado } from './tope-wa';
import { WhatsAppCapService } from '../whatsapp-usage/whatsapp-cap.service';

const TRANSACCION = { maxWait: 15_000, timeout: 60_000 };
const ORIGEN = 'COMUNICADO';

interface FilaComunicado {
    idComunicado: number;
    idTenant: number;
    idEmpresa: number;
    Estado: string;
    Prioridad: string;
    CanalesForzados: unknown;
    Escalamiento: unknown;
    Categoria: string | null;
    idAudiencia: number | null;
    CriteriosAudiencia: unknown;
    VigenteHasta: Date | null;
    VersionActual: number;
    TotalDestinatarios: number;
    CreadoPor: string;
    ComTiposComunicado: { Codigo: string; EsCorto: boolean };
}

interface ContextoEnvio {
    idComunicado: number;
    idTenant: number;
    idEmpresa: number;
    estado: string;
    prioridad: 'NORMAL' | 'IMPORTANTE' | 'CRITICA';
    titulo: string;
    resumen: string;
    categoria: string | null;
    vigenteHasta: Date | null;
    creadoPor: string;
    codigoTipo: string;
    plantillaWa: string | null;
    escalamiento: unknown;
    totalDestinatarios: number;
    empresa: string;
    politicaWhatsApp: string;
    escalaImportanteMin: number;
    escalaCriticaMin: number;
    escalaCorreoMin: number;
    silencioActivo: boolean;
    silencioInicio: string;
    silencioFin: string;
}

interface Contacto {
    idEmpleado: number;
    userUuid: string | null;
    nombre: string;
    telefono: string | null;
    correo: string | null;
    idSite: number | null;
}

interface PersonaCongelada {
    idEmpleado: number;
    idUsuario: string | null;
    idSite: number | null;
    idArea: number | null;
    idPuesto: number | null;
    idTipoPersonal: number | null;
    idJefe: number | null;
    canales: Canal[];
}

@Injectable()
export class AnnouncementDispatchService {
    private readonly logger = new Logger(AnnouncementDispatchService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly capabilities: CommsCapabilityService,
        private readonly resolver: AudienceResolverService,
        private readonly canales: EffectiveChannelService,
        private readonly dispatcher: NotificationDispatcher,
        private readonly gateway: WebsocketGateway,
        private readonly config: ConfigService,
        @InjectQueue(COLA_ENVIO) private readonly colaEnvio: Queue,
        @InjectQueue(COLA_ESCALAMIENTO) private readonly colaEscala: Queue,
        @Optional() @Inject(WhatsAppCapService) private readonly caps?: WhatsAppCapService,
    ) {}

    ahora(): Date {
        return new Date();
    }

    async enviar(activeUser: ActiveUserDto, companyId: number, id: number) {
        const fila = await this.cargar(id, companyId, activeUser.idTenant);
        if (fila.Estado === 'ENVIADO' || fila.Estado === 'ENVIANDO') {
            return this.respuesta(fila, true);
        }
        exigirTransicion(fila.Estado as 'BORRADOR', 'ENVIANDO');
        const personas = await this.preparar(activeUser, companyId, fila);
        const claim = await this.prisma.comComunicados.updateMany({
            where: { idComunicado: id, Estado: { in: ['BORRADOR', 'PROGRAMADO'] } },
            data: { Estado: 'ENVIANDO' },
        });
        if (claim.count === 0) {
            const actual = await this.cargar(id, companyId, activeUser.idTenant);
            if (actual.Estado === 'ENVIADO' || actual.Estado === 'ENVIANDO') return this.respuesta(actual, true);
            exigirTransicion(actual.Estado as 'BORRADOR', 'ENVIANDO');
        }
        await this.quitarProgramado(id);
        try {
            await this.congelar(id, personas);
            const total = await this.prisma.comDestinatarios.count({ where: { idComunicado: id } });
            await this.encolarLotes(id);
            await this.prisma.$transaction(async (tx) => {
                await tx.comComunicados.update({
                    where: { idComunicado: id },
                    data: { Estado: 'ENVIADO', EnviadoEn: this.ahora(), TotalDestinatarios: total },
                });
                await tx.historicoMovimientos.create({
                    data: bitacora(activeUser, companyId, 'ACTUALIZAR', id, `envió el comunicado a ${total} personas.`),
                });
            }, TRANSACCION);
            return { id, estado: 'ENVIADO', totalDestinatarios: total, idempotente: false };
        } catch (error) {
            const cuantos = await this.prisma.comDestinatarios.count({ where: { idComunicado: id } });
            if (cuantos === 0) {
                await this.prisma.comComunicados.update({
                    where: { idComunicado: id },
                    data: { Estado: fila.Estado as 'BORRADOR' },
                });
            }
            throw error;
        }
    }

    async programar(activeUser: ActiveUserDto, companyId: number, id: number, programadoPara: string) {
        const fecha = fechaFutura(programadoPara, this.ahora());
        const fila = await this.cargar(id, companyId, activeUser.idTenant);
        if (fila.Estado !== 'PROGRAMADO') exigirTransicion(fila.Estado as 'BORRADOR', 'PROGRAMADO');
        await this.preparar(activeUser, companyId, fila);
        await this.prisma.$transaction(async (tx) => {
            await tx.comComunicados.update({
                where: { idComunicado: id },
                data: { Estado: 'PROGRAMADO', ProgramadoPara: fecha },
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'ACTUALIZAR', id, 'programó el comunicado.'),
            });
        }, TRANSACCION);
        await this.quitarProgramado(id);
        const delay = Math.max(0, fecha.getTime() - this.ahora().getTime());
        await this.encolar(this.colaEnvio, 'programado', { idComunicado: id }, {
            delay,
            jobId: `programado-${id}`,
            removeOnComplete: true,
        });
        return { id, estado: 'PROGRAMADO', programadoPara: fecha };
    }

    async quitarProgramado(id: number): Promise<void> {
        try {
            const job = await this.colaEnvio.getJob(`programado-${id}`);
            await job?.remove();
        } catch (error) {
            this.logger.warn(`No se pudo quitar el envío programado ${id}: ${mensajeError(error)}`);
        }
    }

    async ejecutarProgramado(idComunicado: number): Promise<void> {
        const fila = await this.prisma.comComunicados.findFirst({ where: { idComunicado } });
        if (!fila || fila.Estado !== 'PROGRAMADO') return;
        const usuario = await this.prisma.auth_user.findUnique({ where: { uuid: fila.CreadoPor } });
        if (!usuario || usuario.idTenant == null) return;
        await this.enviar(
            {
                id: usuario.id,
                uuid: usuario.uuid,
                idTenant: fila.idTenant,
                username: usuario.username,
                first_name: usuario.first_name,
                last_name: usuario.last_name,
                email: usuario.email,
            },
            fila.idEmpresa,
            idComunicado,
        );
    }

    async notificarActualizacion(idComunicado: number): Promise<void> {
        try {
            await this.colaEnvio.add('actualizacion', { idComunicado }, { removeOnComplete: true, jobId: `actualizacion-${idComunicado}-${this.ahora().getTime()}` });
        } catch (error) {
            this.logger.warn(`No se encoló el aviso de versión ${idComunicado}: ${mensajeError(error)}`);
        }
    }

    async procesarLote(idComunicado: number, ids: number[]): Promise<void> {
        if (!ids.length) return;
        const ctx = await this.contexto(idComunicado);
        if (!ctx || ctx.estado === 'CANCELADO' || ctx.estado === 'ARCHIVADO') return;
        const destinatarios = await this.prisma.comDestinatarios.findMany({
            where: { idComunicado, idDestinatario: { in: ids } },
        });
        const contactos = await this.contactos(destinatarios.map((fila) => fila.idEmpleado));
        const turnos = await this.turnosDe(destinatarios.map((fila) => fila.idEmpleado));
        const zonas = await this.zonas(destinatarios.map((fila) => fila.idSite).filter((id): id is number => id != null));
        for (const dest of destinatarios) {
            if (dest.Estado === 'SIN_CANAL' || dest.UltimoIntentoEn) continue;
            const claim = await this.prisma.comDestinatarios.updateMany({
                where: { idDestinatario: dest.idDestinatario, UltimoIntentoEn: null },
                data: { UltimoIntentoEn: this.ahora() },
            });
            if (claim.count === 0) continue;
            try {
                await this.entregarPersona(ctx, dest, contactos.get(dest.idEmpleado), turnos.get(dest.idEmpleado) ?? [], zonas);
            } catch (error) {
                await this.prisma.comDestinatarios.update({
                    where: { idDestinatario: dest.idDestinatario },
                    data: { UltimoIntentoEn: null },
                });
                throw error;
            }
        }
        await this.emitirProgreso(ctx);
    }

    async enviarDiferido(datos: JobDiferido): Promise<void> {
        const dest = await this.prisma.comDestinatarios.findUnique({ where: { idDestinatario: datos.idDestinatario } });
        if (!dest) return;
        const ctx = await this.contexto(datos.idComunicado);
        if (!ctx || ctx.estado === 'CANCELADO' || ctx.estado === 'ARCHIVADO') return;
        if (dest.LeidoEn) {
            if (dest.idUsuario) {
                await this.dispatcher.omitirPendientes(
                    { userUuid: dest.idUsuario, origenTipo: ORIGEN, origenId: String(ctx.idComunicado) },
                    datos.canales,
                    'La persona ya leyó el comunicado.',
                );
            }
            return;
        }
        const contactos = await this.contactos([dest.idEmpleado]);
        const contacto = contactos.get(dest.idEmpleado);
        if (!contacto?.userUuid) return;
        const enlace = datos.canales.some((canal) => canal === 'EMAIL' || canal === 'WHATSAPP')
            ? await this.crearEnlace(dest.idDestinatario, ctx.vigenteHasta)
            : null;
        const entregas = await this.dispatcher.completarPendientes(
            { userUuid: contacto.userUuid, origenTipo: ORIGEN, origenId: String(ctx.idComunicado) },
            datos.canales,
            this.payload(ctx, contacto, enlace),
        );
        const whatsapp = entregas.find((entrega) => entrega.canal === 'WHATSAPP');
        if (whatsapp && ctx.plantillaWa && contacto.telefono) {
            await this.registrarWhatsapp(ctx, contacto.telefono, ctx.plantillaWa, whatsapp);
        }
        if (entregas.some((entrega) => entrega.status === 'SENT')) {
            await this.prisma.comDestinatarios.update({
                where: { idDestinatario: dest.idDestinatario },
                data: { Estado: 'ENTREGADO' },
            });
        }
    }

    async procesarActualizacion(idComunicado: number): Promise<void> {
        const ctx = await this.contexto(idComunicado);
        if (!ctx) return;
        const destinatarios = await this.prisma.comDestinatarios.findMany({
            where: { idComunicado, idUsuario: { not: null } },
            select: { idEmpleado: true, idUsuario: true },
        });
        for (const lote of partir(destinatarios, LOTE_ENVIO)) {
            const contactos = await this.contactos(lote.map((fila) => fila.idEmpleado));
            for (const fila of lote) {
                const contacto = contactos.get(fila.idEmpleado);
                if (!contacto?.userUuid) continue;
                await this.dispatcher.dispatchComms(
                    { userUuid: contacto.userUuid },
                    {
                        ...this.payload(ctx, contacto, null),
                        titulo: 'Se actualizó el comunicado',
                        mensaje: ctx.titulo,
                        origenTipo: 'COMUNICADO_VERSION',
                        notificationTypeCode: 'COMUNICADO_ACTUALIZADO',
                    },
                    [
                        { codigo: 'SOCKETS', enviarAhora: true },
                        { codigo: 'PUSH', enviarAhora: true },
                    ],
                );
            }
        }
    }

    /** Sin LeidoEn manda el siguiente canal. Si ya leyó, no manda nada. */
    async escalar(idDestinatario: number): Promise<'omitido' | 'enviado' | 'sin_canal'> {
        const dest = await this.prisma.comDestinatarios.findUnique({ where: { idDestinatario } });
        if (!dest || dest.LeidoEn || dest.Estado === 'LEIDO' || dest.Estado === 'CONFIRMADO') return 'omitido';
        const ctx = await this.contexto(dest.idComunicado);
        if (!ctx || (ctx.prioridad !== 'IMPORTANTE' && ctx.prioridad !== 'CRITICA')) return 'omitido';
        const contacto = (await this.contactos([dest.idEmpleado])).get(dest.idEmpleado);
        if (!contacto?.userUuid) return 'sin_canal';
        const usados = [...normalizarCanales(dest.CanalesEfectivos), ...canalesEscalados(dest.EscaladoA)];
        const canal = await this.canalDeEscalamiento(ctx, contacto, usados);
        if (!canal) return 'sin_canal';
        const enlace = await this.crearEnlace(dest.idDestinatario, ctx.vigenteHasta);
        const codigo = canal === 'CORREO' ? 'EMAIL' : 'WHATSAPP';
        const resultado = await this.dispatcher.dispatchComms(
            { userUuid: contacto.userUuid },
            this.payload(ctx, contacto, enlace),
            [{ codigo, enviarAhora: true }],
        );
        const entrega = resultado.entregas.find((item) => item.canal === codigo);
        if (canal === 'WHATSAPP' && ctx.plantillaWa && contacto.telefono && entrega) {
            await this.registrarWhatsapp(ctx, contacto.telefono, ctx.plantillaWa, entrega);
        }
        const previos = canalesEscalados(dest.EscaladoA);
        await this.prisma.comDestinatarios.update({
            where: { idDestinatario },
            data: {
                EscaladoA: { canales: [...previos, canal], en: this.ahora().toISOString() },
            },
        });
        return entrega?.status === 'FAILED' ? 'sin_canal' : 'enviado';
    }

    /**
     * Vuelve a encolar solo filas PENDIENTE. Actualiza los canales con el perfil de ahora,
     * suma RecordatoriosEnviados y deja que el lote respete silencio y tope.
     */
    async reencolarPendientes(idComunicado: number, ids: number[]): Promise<{ reenviados: number; sinCanal: number }> {
        if (!ids.length) return { reenviados: 0, sinCanal: 0 };
        const fila = await this.prisma.comComunicados.findFirst({
            where: { idComunicado },
            include: { ComTiposComunicado: { select: { Codigo: true } } },
        });
        if (!fila) throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos ese comunicado.');
        if (fila.Estado === 'CANCELADO' || fila.Estado === 'ARCHIVADO' || fila.Estado === 'EXPIRADO') {
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Solo puedes reenviar un comunicado que ya se envió.');
        }
        const destinatarios = await this.prisma.comDestinatarios.findMany({
            where: { idComunicado, idDestinatario: { in: ids }, Estado: 'PENDIENTE' },
            select: { idDestinatario: true, idEmpleado: true },
            orderBy: { idDestinatario: 'asc' },
        });
        if (!destinatarios.length) return { reenviados: 0, sinCanal: 0 };
        const [efectivos, config] = await Promise.all([
            this.canales.forEmployees(
                destinatarios.map((dest) => dest.idEmpleado),
                fila.idEmpresa,
            ),
            this.prisma.comConfigEmpresa.findUnique({ where: { idEmpresa: fila.idEmpresa } }),
        ]);
        const plantilla = resolverPlantillaWhatsApp(config?.PlantillasWhatsApp, fila.ComTiposComunicado.Codigo, fila.Prioridad);
        const porEmpleado = new Map(efectivos.porEmpleado.map((item) => [item.idEmpleado, item.canales]));
        const forzados = listaONull(fila.CanalesForzados);
        const politica = config?.PoliticaWhatsApp ?? 'IMPORTANTE_CRITICA';
        const aEnviar: number[] = [];
        let sinCanal = 0;
        for (const lote of partir(destinatarios, LOTE_CONGELAR)) {
            await this.prisma.$transaction(async (tx) => {
                for (const dest of lote) {
                    let canales = canalesParaEnvio(porEmpleado.get(dest.idEmpleado) ?? [], forzados, fila.Prioridad, politica);
                    if (!plantilla) canales = canales.filter((canal) => canal !== 'WHATSAPP');
                    const tieneCanal = canales.length > 0;
                    await tx.comDestinatarios.update({
                        where: { idDestinatario: dest.idDestinatario },
                        data: {
                            CanalesEfectivos: canales as unknown as Prisma.InputJsonValue,
                            RecordatoriosEnviados: { increment: 1 },
                            UltimoIntentoEn: null,
                            Estado: tieneCanal ? 'PENDIENTE' : 'SIN_CANAL',
                        },
                    });
                    if (tieneCanal) aEnviar.push(dest.idDestinatario);
                    else sinCanal += 1;
                }
            }, TRANSACCION);
        }
        const lotes = partir(aEnviar, LOTE_ENVIO);
        const marca = this.ahora().getTime();
        for (let indice = 0; indice < lotes.length; indice += 1) {
            await this.encolar(this.colaEnvio, 'lote', { idComunicado, ids: lotes[indice] }, {
                jobId: `reenvio-${idComunicado}-${marca}-${indice}`,
                removeOnComplete: true,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            });
        }
        return { reenviados: aEnviar.length, sinCanal };
    }

    private async preparar(activeUser: ActiveUserDto, companyId: number, fila: FilaComunicado): Promise<PersonaCongelada[]> {
        const version = await this.prisma.comComunicadoVersiones.findUnique({
            where: { idComunicado_NumVersion: { idComunicado: fila.idComunicado, NumVersion: fila.VersionActual } },
        });
        if (!version) throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'El comunicado no tiene versión vigente.');
        if (faltanContenido(version.Titulo, version.Resumen, version.CuerpoHtml).length) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Completa el título, el resumen y el cuerpo.');
        }
        if (fila.VigenteHasta && fila.VigenteHasta.getTime() <= this.ahora().getTime()) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'La vigencia del comunicado ya venció.');
        }
        const criterios = leerCriterios(fila.CriteriosAudiencia);
        if (!fila.idAudiencia && criteriosVacios(criterios)) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'AUDIENCIA_VACIA', 'La audiencia no incluye a ninguna persona.');
        }
        const scope = await this.capabilities.contexto('COM_CREAR', activeUser, companyId);
        const resuelto = await this.resolver.resolve(criterios, scope);
        if (resuelto.fueraDeAlcance.length) {
            throw errorComms(HttpStatus.FORBIDDEN, 'FUERA_DE_ALCANCE', 'La audiencia incluye personas fuera de tu alcance.', {
                ids: resuelto.fueraDeAlcance,
            });
        }
        if (!resuelto.ids.length) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'AUDIENCIA_VACIA', 'La audiencia no incluye a ninguna persona.');
        }
        const [efectivos, config] = await Promise.all([
            this.canales.forEmployees(resuelto.ids, companyId),
            this.prisma.comConfigEmpresa.findUnique({ where: { idEmpresa: companyId } }),
        ]);
        const politica = config?.PoliticaWhatsApp ?? 'IMPORTANTE_CRITICA';
        const forzados = listaONull(fila.CanalesForzados);
        const porEmpleado = new Map(efectivos.porEmpleado.map((filaCanal) => [filaCanal.idEmpleado, filaCanal.canales]));
        const personas = await this.armarPersonas(resuelto.ids, porEmpleado, forzados, fila.Prioridad, politica);
        if (!personas.length) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'AUDIENCIA_VACIA', 'La audiencia no incluye a ninguna persona.');
        }
        const efectivas = await this.capabilities.getEffective(activeUser, companyId);
        const usaWhatsapp = fila.Prioridad === 'CRITICA' || personas.some((persona) => persona.canales.includes('WHATSAPP'));
        if (usaWhatsapp && !efectivas.some((item) => item.codigo === 'COM_CRITICO')) {
            throw errorComms(
                HttpStatus.FORBIDDEN,
                'PRIORIDAD_NO_PERMITIDA',
                'La prioridad crítica y WhatsApp requieren permiso de comunicados críticos.',
            );
        }
        if (personas.some((persona) => persona.canales.includes('WHATSAPP'))) {
            const plantilla = resolverPlantillaWhatsApp(config?.PlantillasWhatsApp, fila.ComTiposComunicado.Codigo, fila.Prioridad);
            if (!plantilla) {
                throw errorComms(
                    HttpStatus.CONFLICT,
                    'PLANTILLA_WA_NO_CONFIGURADA',
                    'Configura la plantilla de WhatsApp antes de enviar por ese canal.',
                );
            }
        }
        return personas;
    }

    private async armarPersonas(
        ids: number[],
        porEmpleado: Map<number, Canal[]>,
        forzados: string[] | null,
        prioridad: string,
        politica: string,
    ): Promise<PersonaCongelada[]> {
        const personas: PersonaCongelada[] = [];
        for (const lote of partir(ids, LOTE_CONGELAR)) {
            const filas = await this.prisma.empleados.findMany({
                where: { idEmpleado: { in: lote }, activo: true },
                select: {
                    idEmpleado: true,
                    idUsuario: true,
                    idSite: true,
                    idPuesto: true,
                    idTipoPersonalOverride: true,
                    idJefeInmediato: true,
                    CatPuestos: { select: { idArea: true, idTipoPersonal: true } },
                },
            });
            const porId = new Map(filas.map((fila) => [fila.idEmpleado, fila]));
            for (const id of lote) {
                const fila = porId.get(id);
                if (!fila) continue;
                personas.push({
                    idEmpleado: fila.idEmpleado,
                    idUsuario: fila.idUsuario,
                    idSite: fila.idSite,
                    idArea: fila.CatPuestos?.idArea ?? null,
                    idPuesto: fila.idPuesto,
                    idTipoPersonal: fila.idTipoPersonalOverride ?? fila.CatPuestos?.idTipoPersonal ?? null,
                    idJefe: fila.idJefeInmediato,
                    canales: canalesParaEnvio(porEmpleado.get(id) ?? [], forzados, prioridad, politica),
                });
            }
        }
        return personas;
    }

    private async congelar(idComunicado: number, personas: PersonaCongelada[]): Promise<void> {
        for (const lote of partir(personas, LOTE_CONGELAR)) {
            await this.prisma.$transaction(async (tx) => {
                await tx.comDestinatarios.createMany({
                    data: lote.map((persona) => ({
                        idComunicado,
                        idEmpleado: persona.idEmpleado,
                        idUsuario: persona.idUsuario,
                        idSite: persona.idSite,
                        idArea: persona.idArea,
                        idPuesto: persona.idPuesto,
                        idTipoPersonal: persona.idTipoPersonal,
                        idJefe: persona.idJefe,
                        CanalesEfectivos: persona.canales as unknown as Prisma.InputJsonValue,
                        Estado: persona.canales.length ? 'PENDIENTE' : 'SIN_CANAL',
                        UltimoIntentoEn: persona.canales.length ? null : this.ahora(),
                    })),
                    skipDuplicates: true,
                });
            }, TRANSACCION);
        }
    }

    private async encolarLotes(idComunicado: number): Promise<void> {
        const filas = await this.prisma.comDestinatarios.findMany({
            where: { idComunicado, Estado: { not: 'SIN_CANAL' } },
            select: { idDestinatario: true },
            orderBy: { idDestinatario: 'asc' },
        });
        const lotes = partir(filas.map((fila) => fila.idDestinatario), LOTE_ENVIO);
        for (let indice = 0; indice < lotes.length; indice += 1) {
            await this.encolar(this.colaEnvio, 'lote', { idComunicado, ids: lotes[indice] }, {
                jobId: `lote-${idComunicado}-${indice}`,
                removeOnComplete: true,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            });
        }
    }

    private async entregarPersona(
        ctx: ContextoEnvio,
        dest: {
            idDestinatario: number;
            idEmpleado: number;
            idUsuario: string | null;
            idSite: number | null;
            CanalesEfectivos: unknown;
            Estado: string;
        },
        contacto: Contacto | undefined,
        turnos: { dia: string; entrada: number; salida: number }[],
        zonas: Map<number, string>,
    ): Promise<void> {
        const canales = normalizarCanales(dest.CanalesEfectivos);
        if (!canales.length) {
            await this.prisma.comDestinatarios.update({
                where: { idDestinatario: dest.idDestinatario },
                data: { Estado: 'SIN_CANAL' },
            });
            return;
        }
        const persona = contacto ?? {
            idEmpleado: dest.idEmpleado,
            userUuid: dest.idUsuario,
            nombre: 'colaborador',
            telefono: null,
            correo: null,
            idSite: dest.idSite,
        };
        let planes = planearCanales({
            canales,
            prioridad: ctx.prioridad,
            ahora: this.ahora(),
            zonaHoraria: (persona.idSite != null ? zonas.get(persona.idSite) : null) ?? 'America/Mexico_City',
            turnos,
            silencio: {
                activo: ctx.silencioActivo,
                inicio: ctx.silencioInicio,
                fin: ctx.silencioFin,
            },
        });
        if (planes.some((plan) => plan.codigo === 'WHATSAPP' && plan.enviarAhora) && (await this.bloqueado(ctx))) {
            planes = planes.filter((plan) => plan.codigo !== 'WHATSAPP');
        }
        const necesitaEnlace = planes.some((plan) => plan.enviarAhora && (plan.codigo === 'EMAIL' || plan.codigo === 'WHATSAPP'));
        const enlace = necesitaEnlace ? await this.crearEnlace(dest.idDestinatario, ctx.vigenteHasta) : null;
        let estado: 'PENDIENTE' | 'ENTREGADO' | 'FALLIDO' = 'PENDIENTE';
        if (persona.userUuid && planes.length) {
            const resultado = await this.dispatcher.dispatchComms(
                { userUuid: persona.userUuid },
                this.payload(ctx, { ...persona, userUuid: persona.userUuid }, enlace),
                planes.map((plan) => ({ codigo: plan.codigo, enviarAhora: plan.enviarAhora })),
            );
            const whatsapp = resultado.entregas.find((entrega) => entrega.canal === 'WHATSAPP' && entrega.status !== 'PENDIENTE');
            if (whatsapp && ctx.plantillaWa && persona.telefono) {
                await this.registrarWhatsapp(ctx, persona.telefono, ctx.plantillaWa, whatsapp);
            }
            const inmediatos = resultado.entregas.filter((entrega) => entrega.status !== 'PENDIENTE');
            if (inmediatos.length && inmediatos.every((entrega) => entrega.status === 'FAILED')) estado = 'FALLIDO';
            else if (inmediatos.some((entrega) => entrega.status === 'SENT')) estado = 'ENTREGADO';
        }
        const diferidos = new Map<number, CodigoProveedor[]>();
        for (const plan of planes) {
            if (plan.enviarAhora || plan.codigo === 'KIOSCO') continue;
            const lista = diferidos.get(plan.en.getTime()) ?? [];
            lista.push(plan.codigo);
            diferidos.set(plan.en.getTime(), lista);
        }
        const ahoraMs = this.ahora().getTime();
        for (const [cuando, codigos] of diferidos) {
            await this.encolar(
                this.colaEnvio,
                'diferido',
                { idComunicado: ctx.idComunicado, idDestinatario: dest.idDestinatario, canales: codigos },
                { delay: Math.max(0, cuando - ahoraMs), jobId: `diferido-${dest.idDestinatario}-${cuando}`, removeOnComplete: true },
            );
        }
        if (estado === 'PENDIENTE' && diferidos.size === 0 && !planes.some((plan) => plan.codigo === 'KIOSCO')) {
            estado = 'FALLIDO';
        }
        await this.prisma.comDestinatarios.update({
            where: { idDestinatario: dest.idDestinatario },
            data: { Estado: estado },
        });
        await this.programarEscalamiento(ctx, dest.idDestinatario, canales, persona);
    }

    private async programarEscalamiento(
        ctx: ContextoEnvio,
        idDestinatario: number,
        canales: readonly string[],
        contacto: Contacto,
    ): Promise<void> {
        const canal = await this.canalDeEscalamiento(ctx, contacto, canales);
        if (!canal) return;
        const minutos = minutosDeEscalamiento(ctx.prioridad, canal, ctx.escalamiento, {
            importante: ctx.escalaImportanteMin,
            critica: ctx.escalaCriticaMin,
            correo: ctx.escalaCorreoMin,
        });
        if (minutos == null) return;
        await this.encolar(this.colaEscala, 'escalar', { idDestinatario }, {
            delay: minutos * 60_000,
            jobId: `escala-${idDestinatario}`,
            removeOnComplete: true,
        });
    }

    private async canalDeEscalamiento(
        ctx: ContextoEnvio,
        contacto: Contacto,
        usados: readonly string[],
    ): Promise<'WHATSAPP' | 'CORREO' | null> {
        if (ctx.prioridad !== 'IMPORTANTE' && ctx.prioridad !== 'CRITICA') return null;
        const disponibles: ('WHATSAPP' | 'CORREO')[] = [];
        if (contacto.telefono && ctx.plantillaWa) disponibles.push('WHATSAPP');
        if (contacto.correo) disponibles.push('CORREO');
        let canal = siguienteCanal(usados, disponibles);
        if (canal === 'WHATSAPP' && (await this.bloqueado(ctx))) {
            canal = siguienteCanal([...usados, 'WHATSAPP'], disponibles);
        }
        return canal;
    }

    private async contexto(idComunicado: number): Promise<ContextoEnvio | null> {
        const fila = await this.prisma.comComunicados.findFirst({
            where: { idComunicado },
            include: { ComTiposComunicado: true },
        });
        if (!fila) return null;
        const [version, config, empresa] = await Promise.all([
            this.prisma.comComunicadoVersiones.findUnique({
                where: { idComunicado_NumVersion: { idComunicado, NumVersion: fila.VersionActual } },
            }),
            this.prisma.comConfigEmpresa.findUnique({ where: { idEmpresa: fila.idEmpresa } }),
            this.prisma.catEmpresas.findUnique({ where: { idEmpresa: fila.idEmpresa }, select: { nombre_comercial: true } }),
        ]);
        const prioridad = fila.Prioridad === 'CRITICA' || fila.Prioridad === 'IMPORTANTE' ? fila.Prioridad : 'NORMAL';
        return {
            idComunicado,
            idTenant: fila.idTenant,
            idEmpresa: fila.idEmpresa,
            estado: fila.Estado,
            prioridad,
            titulo: version?.Titulo ?? 'Comunicado',
            resumen: version?.Resumen ?? '',
            categoria: fila.Categoria,
            vigenteHasta: fila.VigenteHasta,
            creadoPor: fila.CreadoPor,
            codigoTipo: fila.ComTiposComunicado.Codigo,
            plantillaWa: resolverPlantillaWhatsApp(config?.PlantillasWhatsApp, fila.ComTiposComunicado.Codigo, fila.Prioridad),
            escalamiento: fila.Escalamiento,
            totalDestinatarios: fila.TotalDestinatarios,
            empresa: empresa?.nombre_comercial ?? '',
            politicaWhatsApp: config?.PoliticaWhatsApp ?? 'IMPORTANTE_CRITICA',
            escalaImportanteMin: config?.EscalaImportanteMin ?? 240,
            escalaCriticaMin: config?.EscalaCriticaMin ?? 120,
            escalaCorreoMin: config?.EscalaCorreoMin ?? 240,
            silencioActivo: config?.SilencioActivo ?? true,
            silencioInicio: config?.SilencioInicio ?? '21:00',
            silencioFin: config?.SilencioFin ?? '07:00',
        };
    }

    private payload(ctx: ContextoEnvio, contacto: Contacto, enlace: string | null): CommsPayload {
        const nombre = contacto.nombre || 'colaborador';
        return {
            userUuid: contacto.userUuid ?? '',
            titulo: ctx.titulo,
            mensaje: ctx.resumen,
            categoria: (ctx.categoria ?? 'COMUNICADO').slice(0, 30),
            prioridad: ctx.prioridad,
            deepLink: `/companies/${ctx.idEmpresa}/comms/announcements/${ctx.idComunicado}`,
            origenTipo: ORIGEN,
            origenId: String(ctx.idComunicado),
            idTenant: ctx.idTenant,
            idEmpresa: ctx.idEmpresa,
            notificationTypeCode: 'COMUNICADO',
            correo: contacto.correo
                ? { to: contacto.correo, context: { nombre, titulo: ctx.titulo, resumen: ctx.resumen, enlace: enlace ?? '' } }
                : undefined,
            whatsapp:
                contacto.telefono && ctx.plantillaWa
                    ? { phone: contacto.telefono, templateId: ctx.plantillaWa, params: [nombre, ctx.titulo, enlace ?? ''] }
                    : undefined,
            push: {
                title: ctx.titulo,
                body: ctx.resumen,
                data: { idComunicado: String(ctx.idComunicado) },
            },
        };
    }

    private async crearEnlace(idDestinatario: number, vigenteHasta: Date | null): Promise<string> {
        const ahora = this.ahora();
        const { token, hash } = nuevoTokenEnlace();
        await this.prisma.comEnlacesSeguros.create({
            data: {
                idDestinatario,
                TokenHash: hash,
                ExpiraEn: expiracionEnlace(vigenteHasta, ahora),
            },
        });
        const base = this.config.get<string>('COMMS_PUBLIC_BASE_URL') || this.config.get<string>('FRONT_URL') || '';
        return urlEnlace(base, token);
    }

    private async registrarWhatsapp(
        ctx: ContextoEnvio,
        telefono: string,
        plantilla: string,
        entrega: { id: string; status: string; proveedorMsgId?: string },
    ): Promise<void> {
        if (entrega.status !== 'SENT' && entrega.status !== 'FAILED') return;
        const ahora = this.ahora();
        const precio = await this.precioActual(ctx.idTenant, ahora, ctx.prioridad);
        const fallido = entrega.status === 'FAILED';
        await this.prisma.waConsumo.create({
            data: {
                idTenant: ctx.idTenant,
                idEmpresa: ctx.idEmpresa,
                idEntrega: entrega.id,
                Plantilla: plantilla.slice(0, 80),
                CategoriaInterna: ctx.prioridad,
                OrigenTipo: 'COMUNICADO',
                OrigenId: String(ctx.idComunicado),
                TelefonoUlt4: telefono.replace(/\D/g, '').slice(-4).padStart(4, '0'),
                ProveedorMsgId: entrega.proveedorMsgId ?? null,
                Estatus: fallido ? 'FALLIDO' : 'ENVIADO',
                PrecioUnitario: precio.precio,
                Moneda: precio.moneda,
                Costo: fallido ? 0 : precio.precio,
                EnviadoEn: ahora,
            },
        });
        if (!fallido) await this.caps?.revisarAviso(ctx.idTenant, ctx.idEmpresa, ahora);
    }

    private async precioActual(idTenant: number, ahora: Date, categoria: string): Promise<{ precio: number; moneda: string }> {
        const filas = await this.prisma.waPrecios.findMany({
            where: { VigenteDesde: { lte: ahora }, OR: [{ idTenant }, { idTenant: null }] },
        });
        const precios: FilaPrecioWa[] = filas.map((fila) => ({
            idTenant: fila.idTenant,
            precioBase: aNumero(fila.PrecioBase),
            preciosCategoria: fila.PreciosCategoria,
            moneda: fila.Moneda,
            vigenteDesde: fila.VigenteDesde,
        }));
        return precioVigente(precios, idTenant, ahora, categoria) ?? { precio: 0, moneda: 'MXN' };
    }

    private async bloqueado(ctx: ContextoEnvio): Promise<boolean> {
        if (this.caps) return !(await this.caps.canSend(ctx.idTenant, ctx.idEmpresa, ctx.prioridad, this.ahora()));
        const ahora = this.ahora();
        const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
        const [suma, topes] = await Promise.all([
            this.prisma.waConsumo.aggregate({
                where: { idTenant: ctx.idTenant, idEmpresa: ctx.idEmpresa, EnviadoEn: { gte: inicio } },
                _sum: { Costo: true },
            }),
            this.prisma.waTopes.findMany({
                where: { idTenant: ctx.idTenant, Activo: true, OR: [{ idEmpresa: ctx.idEmpresa }, { idEmpresa: null }] },
            }),
        ]);
        const propio = topes.find((tope) => tope.idEmpresa === ctx.idEmpresa) ?? topes.find((tope) => tope.idEmpresa == null);
        return whatsappBloqueado({
            prioridad: ctx.prioridad,
            consumo: aNumero(suma._sum.Costo),
            tope: propio ? aNumero(propio.TopeMensual) : null,
            accion: propio?.Accion ?? null,
        });
    }

    private async contactos(ids: number[]): Promise<Map<number, Contacto>> {
        const mapa = new Map<number, Contacto>();
        for (const lote of partir(ids, LOTE_CONGELAR)) {
            if (!lote.length) continue;
            const filas = await this.prisma.empleados.findMany({
                where: { idEmpleado: { in: lote } },
                select: {
                    idEmpleado: true,
                    idUsuario: true,
                    idSite: true,
                    nombre: true,
                    primerApellido: true,
                    telefonoMovil: true,
                    correo: true,
                },
            });
            for (const fila of filas) {
                mapa.set(fila.idEmpleado, {
                    idEmpleado: fila.idEmpleado,
                    userUuid: fila.idUsuario,
                    nombre: [fila.nombre, fila.primerApellido].filter((parte) => parte && parte.trim()).join(' ').trim() || 'colaborador',
                    telefono: fila.telefonoMovil,
                    correo: fila.correo,
                    idSite: fila.idSite,
                });
            }
        }
        return mapa;
    }

    private async turnosDe(ids: number[]): Promise<Map<number, { dia: string; entrada: number; salida: number }[]>> {
        const mapa = new Map<number, { dia: string; entrada: number; salida: number }[]>();
        if (!ids.length) return mapa;
        const filas = await this.prisma.horariosEmpleado.findMany({
            where: { idEmpleado: { in: ids } },
            select: { idEmpleado: true, DiaSemana: true, HoraEntrada: true, HoraSalida: true },
        });
        for (const fila of filas) {
            const entrada = minutosDeReloj(fila.HoraEntrada);
            const salida = minutosDeReloj(fila.HoraSalida);
            if (!fila.DiaSemana || entrada == null || salida == null) continue;
            const lista = mapa.get(fila.idEmpleado) ?? [];
            lista.push({ dia: fila.DiaSemana, entrada, salida });
            mapa.set(fila.idEmpleado, lista);
        }
        return mapa;
    }

    private async zonas(ids: number[]): Promise<Map<number, string>> {
        const unicos = [...new Set(ids)];
        if (!unicos.length) return new Map();
        const filas = await this.prisma.catSites.findMany({
            where: { idSite: { in: unicos } },
            select: { idSite: true, zonaHoraria: true },
        });
        return new Map(filas.map((fila) => [fila.idSite, fila.zonaHoraria || 'America/Mexico_City']));
    }

    private async emitirProgreso(ctx: ContextoEnvio): Promise<void> {
        const enviados = await this.prisma.comDestinatarios.count({
            where: { idComunicado: ctx.idComunicado, UltimoIntentoEn: { not: null } },
        });
        try {
            this.gateway.sendNotificationToUser(ctx.creadoPor, 'comms:dispatch-progress', {
                idComunicado: ctx.idComunicado,
                enviados,
                total: ctx.totalDestinatarios,
            });
        } catch (error) {
            this.logger.warn(`No se emitió el progreso del comunicado ${ctx.idComunicado}: ${mensajeError(error)}`);
        }
    }

    private async cargar(id: number, companyId: number, idTenant: number): Promise<FilaComunicado> {
        const fila = await this.prisma.comComunicados.findFirst({
            where: { idComunicado: id, idEmpresa: companyId, idTenant },
            include: { ComTiposComunicado: true },
        });
        if (!fila) throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos ese comunicado.');
        return fila;
    }

    private respuesta(fila: { idComunicado: number; Estado: string; TotalDestinatarios: number }, idempotente: boolean) {
        return {
            id: fila.idComunicado,
            estado: fila.Estado,
            totalDestinatarios: fila.TotalDestinatarios,
            idempotente,
        };
    }

    private async encolar(cola: Queue, nombre: string, datos: object, opts: object): Promise<void> {
        try {
            await cola.add(nombre, datos, opts);
        } catch (error) {
            const texto = mensajeError(error).toLowerCase();
            if (texto.includes('exist') || texto.includes('already') || texto.includes('ya existe')) return;
            throw error;
        }
    }
}

function leerCriterios(valor: unknown): CriteriosAudiencia {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
    return normalizarCriterios(valor as CriteriosAudiencia);
}

function listaONull(valor: unknown): string[] | null {
    if (!Array.isArray(valor)) return null;
    const lista = valor.filter((item): item is string => typeof item === 'string');
    return lista.length ? lista : null;
}

function fechaFutura(iso: string, ahora: Date): Date {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime()) || fecha.getTime() <= ahora.getTime()) {
        throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'La fecha de envío debe ser futura.');
    }
    fecha.setMilliseconds(0);
    return fecha;
}

function bitacora(activeUser: ActiveUserDto, companyId: number, accion: string, id: number, verbo: string) {
    return {
        idUsuario: activeUser.id,
        idEmpresa: companyId,
        accion,
        tablaOrigen: 'ComComunicados',
        idRegistro: String(id),
        descripcion: `${activeUser.first_name} ${activeUser.last_name} ${verbo}`,
        fechaCreacion: new Date(),
    };
}

function aNumero(valor: unknown): number {
    if (valor == null) return 0;
    if (typeof valor === 'number') return valor;
    if (typeof valor === 'object' && valor !== null && 'toNumber' in valor) {
        const convertido = (valor as { toNumber: () => number }).toNumber();
        return Number.isFinite(convertido) ? convertido : 0;
    }
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

function mensajeError(error: unknown): string {
    return error instanceof Error ? error.message : 'Error desconocido.';
}
