import { HttpException, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { ContextoAlcance } from '../capabilities/alcance';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { criteriosVacios, CriteriosAudiencia, normalizarCriterios } from '../audiences/criterios';
import { AudienceResolverService } from '../audiences/audience-resolver.service';
import { EffectiveChannelService } from '../channels/effective-channel.service';
import { resumirCanales } from '../channels/canales';
import { errorComms } from '../comms-http';
import { cabeOtroAdjunto, nombreVisible, validarAdjunto, validarPortada } from './adjuntos';
import { EstadoComunicado, esEstadoComunicado, estadoTrasProgramar, exigirEditable, exigirEnviado, exigirTransicion } from './announcement-state';
import { CommsStorageService, nombreAlmacenado } from './comms-storage.service';
import {
    AcuseComunicado,
    armarRevision,
    ContenidoListo,
    exigeCritico,
    prepararContenido,
    PrioridadComunicado,
    RevisionComunicado,
    vigenciaAviso,
} from './contenido';
import { AnnouncementDispatchService } from '../delivery/announcement-dispatch.service';
import { ProgramarComunicadoDto } from '../delivery/dto/programar-comunicado.dto';
import { ActualizarComunicadoDto, CrearComunicadoDto, NuevaVersionDto } from './dto/comunicado.dto';
import { ListarComunicadosQuery } from './dto/listar-comunicados.query';

const TRANSACCION = { maxWait: 15_000, timeout: 60_000 };
const TTL_ARCHIVO = 60 * 60;
const PAGINA = 20;

type FilaTipo = {
    idTipo: number;
    Codigo: string;
    Nombre: string;
    PrioridadDefault: string;
    AcuseDefault: string;
    ModalDefault: boolean;
    IdentidadDefault: boolean;
    EsCorto: boolean;
};

type Visibilidad = { todos: boolean; autores: string[] };

@Injectable()
export class AnnouncementsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly capabilities: CommsCapabilityService,
        private readonly resolver: AudienceResolverService,
        private readonly canales: EffectiveChannelService,
        private readonly storage: CommsStorageService,
        @Optional() private readonly envio?: AnnouncementDispatchService,
    ) {}

    async tipos(activeUser: ActiveUserDto, companyId: number) {
        const efectivas = await this.autorizar(activeUser, companyId);
        const filas = await this.prisma.comTiposComunicado.findMany({
            where: { idTenant: activeUser.idTenant, Activo: true },
            orderBy: { Nombre: 'asc' },
        });
        const permitidos = tiposDe(efectivas);
        return filas.map((fila) => ({
            id: fila.idTipo,
            codigo: fila.Codigo,
            nombre: fila.Nombre,
            prioridadDefault: fila.PrioridadDefault,
            acuseDefault: fila.AcuseDefault,
            modalDefault: fila.ModalDefault,
            identidadDefault: fila.IdentidadDefault,
            esCorto: fila.EsCorto,
            permitido: permitidos == null || permitidos.includes(fila.Codigo),
        }));
    }

    async crear(activeUser: ActiveUserDto, companyId: number, dto: CrearComunicadoDto) {
        const efectivas = await this.autorizar(activeUser, companyId);
        const tipo = await this.tipoDe(activeUser.idTenant, dto.idTipo);
        this.exigirTipo(efectivas, tipo.Codigo);
        const prioridad = dto.prioridad ?? (tipo.PrioridadDefault as PrioridadComunicado);
        const canales = dto.canalesForzados ?? [];
        this.exigirCritico(efectivas, prioridad, canales);
        const contenido = prepararContenido(dto, tipo.EsCorto, false);
        const programado = dto.programadoPara ? fechaFutura(dto.programadoPara, 'La fecha de envío debe ser futura.') : null;
        const vigente = dto.vigenteHasta
            ? aFecha(dto.vigenteHasta)
            : tipo.EsCorto
              ? vigenciaAviso(new Date())
              : null;
        this.vigenciaContraEnvio(programado, vigente);
        const criterios = await this.criteriosDe(activeUser, companyId, dto.idAudiencia, dto.criteriosAudiencia);
        const estado: EstadoComunicado = programado ? 'PROGRAMADO' : 'BORRADOR';
        exigirTransicion('BORRADOR', estado);

        const creado = await this.prisma.$transaction(async (tx) => {
            const comunicado = await tx.comComunicados.create({
                data: {
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    idTipo: tipo.idTipo,
                    Estado: estado,
                    Prioridad: prioridad,
                    AcuseModo: (dto.acuseModo ?? tipo.AcuseDefault) as AcuseComunicado,
                    MostrarModal: dto.mostrarModal ?? tipo.ModalDefault,
                    RequiereIdentidad: dto.requiereIdentidad ?? tipo.IdentidadDefault,
                    IncluirNuevos: dto.incluirNuevos ?? false,
                    PermitePregunta: dto.permitePregunta ?? false,
                    CanalesForzados: canales.length ? canales : Prisma.JsonNull,
                    Escalamiento: jsonONull(dto.escalamiento),
                    RecordatorioCadaDias: dto.recordatorioCadaDias ?? null,
                    RecordatorioMax: dto.recordatorioMax ?? null,
                    CtaTipo: dto.ctaTipo ?? null,
                    CtaTexto: dto.ctaTexto ?? null,
                    CtaDestino: dto.ctaDestino ?? null,
                    Categoria: dto.categoria ?? null,
                    idAudiencia: criterios.idAudiencia,
                    CriteriosAudiencia: jsonCriterios(criterios.criterios),
                    ProgramadoPara: programado,
                    VigenteHasta: vigente,
                    CreadoPor: activeUser.uuid,
                },
            });
            await tx.comComunicadoVersiones.create({
                data: versionNueva(comunicado.idComunicado, 1, contenido, activeUser.uuid),
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'CREAR', comunicado.idComunicado, `creó el comunicado ${contenido.titulo || tipo.Nombre}.`),
            });
            return comunicado.idComunicado;
        }, TRANSACCION);
        return this.detalle(activeUser, companyId, creado);
    }

    async actualizar(activeUser: ActiveUserDto, companyId: number, id: number, dto: ActualizarComunicadoDto) {
        if (!hayCambios(dto)) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Indica al menos un dato para actualizar.');
        }
        const efectivas = await this.autorizar(activeUser, companyId);
        const actual = await this.buscar(activeUser, companyId, id);
        const estado = comoEstado(actual.Estado);
        exigirEditable(estado);
        const tipo = dto.idTipo ? await this.tipoDe(activeUser.idTenant, dto.idTipo) : await this.tipoDe(activeUser.idTenant, actual.idTipo);
        if (dto.idTipo) this.exigirTipo(efectivas, tipo.Codigo);
        const version = await this.versionVigente(id, actual.VersionActual);
        const prioridad = dto.prioridad ?? (actual.Prioridad as PrioridadComunicado);
        const canales = dto.canalesForzados ?? leerCanales(actual.CanalesForzados);
        this.exigirCritico(efectivas, prioridad, canales);
        const contenido = prepararContenido(
            {
                titulo: dto.titulo ?? version.Titulo,
                resumen: dto.resumen ?? version.Resumen,
                cuerpoHtml: dto.cuerpoHtml ?? version.CuerpoHtml,
            },
            tipo.EsCorto,
            false,
        );
        if (tipo.EsCorto) await this.exigirAdjuntosDeAviso(version.idVersion);
        const programado = dto.programadoPara === undefined
            ? actual.ProgramadoPara
            : dto.programadoPara
              ? fechaFutura(dto.programadoPara, 'La fecha de envío debe ser futura.')
              : null;
        const vigente = dto.vigenteHasta === undefined ? actual.VigenteHasta : dto.vigenteHasta ? aFecha(dto.vigenteHasta) : null;
        this.vigenciaContraEnvio(programado, vigente);
        const siguiente = dto.programadoPara === undefined ? estado : estadoTrasProgramar(estado, programado);
        const criterios =
            dto.criteriosAudiencia || dto.idAudiencia !== undefined
                ? await this.criteriosDe(
                      activeUser,
                      companyId,
                      dto.idAudiencia === undefined ? actual.idAudiencia : dto.idAudiencia,
                      dto.criteriosAudiencia,
                      actual.CriteriosAudiencia,
                  )
                : { idAudiencia: actual.idAudiencia, criterios: leerCriterios(actual.CriteriosAudiencia) };

        await this.prisma.$transaction(async (tx) => {
            await tx.comComunicados.update({
                where: { idComunicado: id },
                data: {
                    idTipo: tipo.idTipo,
                    Estado: siguiente,
                    Prioridad: prioridad,
                    AcuseModo: (dto.acuseModo ?? actual.AcuseModo) as AcuseComunicado,
                    MostrarModal: dto.mostrarModal ?? actual.MostrarModal,
                    RequiereIdentidad: dto.requiereIdentidad ?? actual.RequiereIdentidad,
                    IncluirNuevos: dto.incluirNuevos ?? actual.IncluirNuevos,
                    PermitePregunta: dto.permitePregunta ?? actual.PermitePregunta,
                    CanalesForzados: dto.canalesForzados ? (canales.length ? canales : Prisma.JsonNull) : undefined,
                    Escalamiento: dto.escalamiento === undefined ? undefined : jsonONull(dto.escalamiento),
                    RecordatorioCadaDias: dto.recordatorioCadaDias === undefined ? undefined : dto.recordatorioCadaDias,
                    RecordatorioMax: dto.recordatorioMax === undefined ? undefined : dto.recordatorioMax,
                    CtaTipo: dto.ctaTipo === undefined ? undefined : dto.ctaTipo,
                    CtaTexto: dto.ctaTexto === undefined ? undefined : dto.ctaTexto,
                    CtaDestino: dto.ctaDestino === undefined ? undefined : dto.ctaDestino,
                    Categoria: dto.categoria === undefined ? undefined : dto.categoria,
                    idAudiencia: criterios.idAudiencia,
                    CriteriosAudiencia: jsonCriterios(criterios.criterios),
                    ProgramadoPara: programado,
                    VigenteHasta: vigente,
                },
            });
            await tx.comComunicadoVersiones.update({
                where: { idVersion: version.idVersion },
                data: { Titulo: contenido.titulo, Resumen: contenido.resumen, CuerpoHtml: contenido.cuerpoHtml },
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'ACTUALIZAR', id, `actualizó el comunicado ${contenido.titulo || tipo.Nombre}.`),
            });
        }, TRANSACCION);
        return this.detalle(activeUser, companyId, id);
    }

    async agregarAdjunto(activeUser: ActiveUserDto, companyId: number, id: number, archivo: Express.Multer.File | undefined) {
        await this.autorizar(activeUser, companyId);
        const actual = await this.buscar(activeUser, companyId, id);
        exigirEditable(comoEstado(actual.Estado));
        if (!archivo?.buffer?.length) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'ADJUNTO_INVALIDO', 'Adjunta un archivo.');
        }
        const tipo = await this.tipoDe(activeUser.idTenant, actual.idTipo);
        const mime = validarAdjunto({ buffer: archivo.buffer, mime: archivo.mimetype, nombre: archivo.originalname }, tipo.EsCorto);
        const version = await this.versionVigente(id, actual.VersionActual);
        const cantidad = await this.prisma.comComunicadoAdjuntos.count({ where: { idVersion: version.idVersion } });
        cabeOtroAdjunto(cantidad);
        const ruta = await this.storage.put(archivo.buffer, {
            tenant: activeUser.idTenant,
            empresa: companyId,
            carpeta: `${id}/adjuntos`,
            nombre: nombreAlmacenado(archivo.originalname),
            mime,
        });
        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.comComunicadoAdjuntos.create({
                    data: {
                        idVersion: version.idVersion,
                        Nombre: nombreVisible(archivo.originalname),
                        Ruta: ruta,
                        Mime: mime,
                        TamanoBytes: archivo.buffer.length,
                    },
                });
                await tx.historicoMovimientos.create({
                    data: bitacora(activeUser, companyId, 'ACTUALIZAR', id, 'agregó un adjunto al comunicado.'),
                });
            }, TRANSACCION);
        } catch (error) {
            await this.storage.delete(ruta);
            throw error;
        }
        return this.detalle(activeUser, companyId, id);
    }

    async quitarAdjunto(activeUser: ActiveUserDto, companyId: number, id: number, idAdjunto: number) {
        await this.autorizar(activeUser, companyId);
        const actual = await this.buscar(activeUser, companyId, id);
        exigirEditable(comoEstado(actual.Estado));
        const version = await this.versionVigente(id, actual.VersionActual);
        const adjunto = await this.prisma.comComunicadoAdjuntos.findFirst({
            where: { idAdjunto, idVersion: version.idVersion },
        });
        if (!adjunto) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos ese adjunto.');
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.comComunicadoAdjuntos.delete({ where: { idAdjunto } });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'ACTUALIZAR', id, 'quitó un adjunto del comunicado.'),
            });
        }, TRANSACCION);
        if (await this.rutaLibre(adjunto.Ruta)) await this.storage.delete(adjunto.Ruta);
        return this.detalle(activeUser, companyId, id);
    }

    async portada(activeUser: ActiveUserDto, companyId: number, id: number, archivo: Express.Multer.File | undefined) {
        await this.autorizar(activeUser, companyId);
        const actual = await this.buscar(activeUser, companyId, id);
        exigirEditable(comoEstado(actual.Estado));
        if (!archivo?.buffer?.length) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'ADJUNTO_INVALIDO', 'Adjunta la imagen de portada.');
        }
        const mime = validarPortada({ buffer: archivo.buffer, mime: archivo.mimetype, nombre: archivo.originalname });
        const version = await this.versionVigente(id, actual.VersionActual);
        const anterior = version.PortadaRuta;
        const ruta = await this.storage.put(archivo.buffer, {
            tenant: activeUser.idTenant,
            empresa: companyId,
            carpeta: `${id}/portada`,
            nombre: nombreAlmacenado(archivo.originalname),
            mime,
        });
        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.comComunicadoVersiones.update({ where: { idVersion: version.idVersion }, data: { PortadaRuta: ruta } });
                await tx.historicoMovimientos.create({
                    data: bitacora(activeUser, companyId, 'ACTUALIZAR', id, 'cambió la portada del comunicado.'),
                });
            }, TRANSACCION);
        } catch (error) {
            await this.storage.delete(ruta);
            throw error;
        }
        if (anterior && anterior !== ruta && (await this.rutaLibre(anterior))) await this.storage.delete(anterior);
        return this.detalle(activeUser, companyId, id);
    }

    async revision(activeUser: ActiveUserDto, companyId: number, id: number): Promise<RevisionComunicado> {
        const scope = await this.capabilities.contexto('COM_CREAR', activeUser, companyId);
        const actual = await this.buscar(activeUser, companyId, id);
        const tipo = await this.tipoDe(activeUser.idTenant, actual.idTipo);
        const version = await this.versionVigente(id, actual.VersionActual);
        const criterios = leerCriterios(actual.CriteriosAudiencia);
        const sinAudiencia = !actual.idAudiencia && criteriosVacios(criterios);
        const resuelto = sinAudiencia ? { ids: [] as number[], fueraDeAlcance: [] as number[] } : await this.resolver.resolve(criterios, scope);
        const canales = resuelto.ids.length ? await this.canales.forEmployees(resuelto.ids, companyId) : null;
        const config = await this.prisma.comConfigEmpresa.findUnique({
            where: { idEmpresa: companyId },
            select: { PlantillasWhatsApp: true },
        });
        return armarRevision({
            total: resuelto.ids.length,
            sinCanal: canales?.resumen.SIN_CANAL ?? 0,
            porCanal: canales?.resumen ?? resumirCanales([]),
            fueraDeAlcance: resuelto.fueraDeAlcance,
            canalesForzados: leerCanales(actual.CanalesForzados),
            plantillasWhatsApp: config?.PlantillasWhatsApp ?? null,
            vigenteHasta: actual.VigenteHasta,
            ahora: new Date(),
            esAviso: tipo.EsCorto,
            titulo: version.Titulo,
            resumen: version.Resumen,
            cuerpo: version.CuerpoHtml,
        });
    }

    async nuevaVersion(activeUser: ActiveUserDto, companyId: number, id: number, dto: NuevaVersionDto) {
        await this.autorizar(activeUser, companyId);
        const actual = await this.buscar(activeUser, companyId, id);
        exigirEnviado(comoEstado(actual.Estado));
        const tipo = await this.tipoDe(activeUser.idTenant, actual.idTipo);
        const version = await this.versionVigente(id, actual.VersionActual);
        const contenido = prepararContenido(
            {
                titulo: dto.titulo ?? version.Titulo,
                resumen: dto.resumen ?? version.Resumen,
                cuerpoHtml: dto.cuerpoHtml ?? version.CuerpoHtml,
            },
            tipo.EsCorto,
            true,
        );
        if (dto.correccionMenor) {
            await this.prisma.$transaction(async (tx) => {
                await tx.comComunicadoVersiones.update({
                    where: { idVersion: version.idVersion },
                    data: {
                        Titulo: contenido.titulo,
                        Resumen: contenido.resumen,
                        CuerpoHtml: contenido.cuerpoHtml,
                        EsCorreccionMenor: true,
                    },
                });
                await tx.historicoMovimientos.create({
                    data: bitacora(activeUser, companyId, 'ACTUALIZAR', id, 'publicó una corrección menor del comunicado.'),
                });
            }, TRANSACCION);
            return this.detalle(activeUser, companyId, id);
        }

        const numero = actual.VersionActual + 1;
        await this.prisma.$transaction(async (tx) => {
            const nueva = await tx.comComunicadoVersiones.create({
                data: {
                    ...versionNueva(id, numero, contenido, activeUser.uuid),
                    PortadaRuta: version.PortadaRuta,
                },
            });
            const adjuntos = await tx.comComunicadoAdjuntos.findMany({ where: { idVersion: version.idVersion } });
            if (adjuntos.length) {
                await tx.comComunicadoAdjuntos.createMany({
                    data: adjuntos.map((adjunto) => ({
                        idVersion: nueva.idVersion,
                        Nombre: adjunto.Nombre,
                        Ruta: adjunto.Ruta,
                        Mime: adjunto.Mime,
                        TamanoBytes: adjunto.TamanoBytes,
                    })),
                });
            }
            await tx.comComunicados.update({ where: { idComunicado: id }, data: { VersionActual: numero } });
            if (actual.AcuseModo === 'LEI_ENTENDI') {
                await tx.comDestinatarios.updateMany({
                    where: { idComunicado: id, Estado: 'CONFIRMADO' },
                    data: { Estado: 'PENDIENTE' },
                });
            }
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'ACTUALIZAR', id, `publicó la versión ${numero} del comunicado.`),
            });
        }, TRANSACCION);
        if (!dto.correccionMenor) await this.envio?.notificarActualizacion(id);
        return this.detalle(activeUser, companyId, id);
    }

    async archivar(activeUser: ActiveUserDto, companyId: number, id: number) {
        await this.autorizar(activeUser, companyId);
        const actual = await this.buscar(activeUser, companyId, id);
        exigirTransicion(comoEstado(actual.Estado), 'ARCHIVADO');
        await this.prisma.$transaction(async (tx) => {
            await tx.comComunicados.update({
                where: { idComunicado: id },
                data: { Estado: 'ARCHIVADO', ArchivadoEn: new Date() },
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'DESACTIVAR', id, 'archivó el comunicado.'),
            });
        }, TRANSACCION);
        return this.detalle(activeUser, companyId, id);
    }

    async cancelar(activeUser: ActiveUserDto, companyId: number, id: number) {
        await this.autorizar(activeUser, companyId);
        const actual = await this.buscar(activeUser, companyId, id);
        exigirTransicion(comoEstado(actual.Estado), 'CANCELADO');
        await this.prisma.$transaction(async (tx) => {
            await tx.comComunicados.update({
                where: { idComunicado: id },
                data: { Estado: 'CANCELADO', ProgramadoPara: null },
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'ACTUALIZAR', id, 'canceló el comunicado programado.'),
            });
        }, TRANSACCION);
        await this.envio?.quitarProgramado(id);
        return this.detalle(activeUser, companyId, id);
    }

    async enviar(activeUser: ActiveUserDto, companyId: number, id: number) {
        await this.autorizar(activeUser, companyId);
        await this.buscar(activeUser, companyId, id);
        if (!this.envio) {
            throw errorComms(HttpStatus.INTERNAL_SERVER_ERROR, 'ENVIO_NO_DISPONIBLE', 'El envío de comunicados no está disponible.');
        }
        return this.envio.enviar(activeUser, companyId, id);
    }

    async programar(activeUser: ActiveUserDto, companyId: number, id: number, dto: ProgramarComunicadoDto) {
        await this.autorizar(activeUser, companyId);
        await this.buscar(activeUser, companyId, id);
        if (!this.envio) {
            throw errorComms(HttpStatus.INTERNAL_SERVER_ERROR, 'ENVIO_NO_DISPONIBLE', 'El envío de comunicados no está disponible.');
        }
        return this.envio.programar(activeUser, companyId, id, dto.programadoPara);
    }

    async duplicar(activeUser: ActiveUserDto, companyId: number, id: number) {
        await this.autorizar(activeUser, companyId);
        const actual = await this.buscar(activeUser, companyId, id);
        const version = await this.versionVigente(id, actual.VersionActual);
        const adjuntos = await this.prisma.comComunicadoAdjuntos.findMany({ where: { idVersion: version.idVersion } });
        const copia = await this.prisma.$transaction(async (tx) => {
            const comunicado = await tx.comComunicados.create({
                data: {
                    idTenant: actual.idTenant,
                    idEmpresa: actual.idEmpresa,
                    idTipo: actual.idTipo,
                    Estado: 'BORRADOR',
                    Prioridad: actual.Prioridad,
                    AcuseModo: actual.AcuseModo,
                    MostrarModal: actual.MostrarModal,
                    RequiereIdentidad: actual.RequiereIdentidad,
                    IncluirNuevos: actual.IncluirNuevos,
                    PermitePregunta: actual.PermitePregunta,
                    CanalesForzados: actual.CanalesForzados === null ? Prisma.JsonNull : (actual.CanalesForzados as Prisma.InputJsonValue),
                    Escalamiento: actual.Escalamiento === null ? Prisma.JsonNull : (actual.Escalamiento as Prisma.InputJsonValue),
                    RecordatorioCadaDias: actual.RecordatorioCadaDias,
                    RecordatorioMax: actual.RecordatorioMax,
                    CtaTipo: actual.CtaTipo,
                    CtaTexto: actual.CtaTexto,
                    CtaDestino: actual.CtaDestino,
                    Categoria: actual.Categoria,
                    idAudiencia: actual.idAudiencia,
                    CriteriosAudiencia: actual.CriteriosAudiencia as Prisma.InputJsonValue,
                    VigenteHasta: actual.VigenteHasta,
                    CreadoPor: activeUser.uuid,
                },
            });
            let portada: string | null = null;
            if (version.PortadaRuta) portada = await this.copiarArchivo(version.PortadaRuta, activeUser.idTenant, companyId, comunicado.idComunicado, 'portada');
            const nueva = await tx.comComunicadoVersiones.create({
                data: {
                    idComunicado: comunicado.idComunicado,
                    NumVersion: 1,
                    Titulo: version.Titulo,
                    Resumen: version.Resumen,
                    CuerpoHtml: version.CuerpoHtml,
                    PortadaRuta: portada,
                    CreadoPor: activeUser.uuid,
                },
            });
            for (const adjunto of adjuntos) {
                const ruta = await this.copiarArchivo(adjunto.Ruta, activeUser.idTenant, companyId, comunicado.idComunicado, 'adjuntos');
                await tx.comComunicadoAdjuntos.create({
                    data: {
                        idVersion: nueva.idVersion,
                        Nombre: adjunto.Nombre,
                        Ruta: ruta,
                        Mime: adjunto.Mime,
                        TamanoBytes: adjunto.TamanoBytes,
                    },
                });
            }
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'CREAR', comunicado.idComunicado, `duplicó el comunicado ${version.Titulo}.`),
            });
            return comunicado.idComunicado;
        }, TRANSACCION);
        return this.detalle(activeUser, companyId, copia);
    }

    async listar(activeUser: ActiveUserDto, companyId: number, query: ListarComunicadosQuery) {
        await this.autorizar(activeUser, companyId);
        const visibilidad = await this.visibilidad(activeUser, companyId);
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? PAGINA;
        const where = this.filtro(activeUser.idTenant, companyId, visibilidad, query);
        const [total, filas] = await Promise.all([
            this.prisma.comComunicados.count({ where }),
            this.prisma.comComunicados.findMany({
                where,
                orderBy: { FechaRegistro: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: { ComTiposComunicado: true },
            }),
        ]);
        const versiones = filas.length
            ? await this.prisma.comComunicadoVersiones.findMany({
                  where: { OR: filas.map((fila) => ({ idComunicado: fila.idComunicado, NumVersion: fila.VersionActual })) },
                  select: { idComunicado: true, Titulo: true, Resumen: true },
              })
            : [];
        const porId = new Map(versiones.map((fila) => [fila.idComunicado, fila]));
        return {
            total,
            page,
            pageSize,
            items: filas.map((fila) => {
                const version = porId.get(fila.idComunicado);
                return {
                    id: fila.idComunicado,
                    estado: fila.Estado,
                    prioridad: fila.Prioridad,
                    tipo: { id: fila.idTipo, codigo: fila.ComTiposComunicado.Codigo, nombre: fila.ComTiposComunicado.Nombre },
                    titulo: version?.Titulo ?? '',
                    resumen: version?.Resumen ?? '',
                    programadoPara: fila.ProgramadoPara,
                    enviadoEn: fila.EnviadoEn,
                    vigenteHasta: fila.VigenteHasta,
                    versionActual: fila.VersionActual,
                    totalDestinatarios: fila.TotalDestinatarios,
                    creadoPor: fila.CreadoPor,
                    fechaRegistro: fila.FechaRegistro,
                    archivadoEn: fila.ArchivadoEn,
                };
            }),
        };
    }

    async kpis(activeUser: ActiveUserDto, companyId: number, mes?: string) {
        await this.autorizar(activeUser, companyId);
        const visibilidad = await this.visibilidad(activeUser, companyId);
        const clave = mes ?? mesUtc(new Date());
        const { desde, hasta } = rangoMes(clave);
        const base = this.filtro(activeUser.idTenant, companyId, visibilidad, {});
        const [grupos, enviadosEnElMes] = await Promise.all([
            this.prisma.comComunicados.groupBy({
                by: ['Estado'],
                where: { ...base, FechaRegistro: { gte: desde, lt: hasta } },
                _count: { _all: true },
            }),
            this.prisma.comComunicados.count({ where: { ...base, EnviadoEn: { gte: desde, lt: hasta } } }),
        ]);
        const porEstado: Record<EstadoComunicado, number> = {
            BORRADOR: 0,
            PROGRAMADO: 0,
            ENVIANDO: 0,
            ENVIADO: 0,
            EXPIRADO: 0,
            CANCELADO: 0,
            ARCHIVADO: 0,
        };
        for (const grupo of grupos) {
            if (esEstadoComunicado(grupo.Estado)) porEstado[grupo.Estado] = grupo._count._all;
        }
        const total = Object.values(porEstado).reduce((suma, n) => suma + n, 0);
        return { mes: clave, porEstado, enviadosEnElMes, total };
    }

    async detalle(activeUser: ActiveUserDto, companyId: number, id: number) {
        await this.autorizar(activeUser, companyId);
        const fila = await this.buscar(activeUser, companyId, id);
        const version = await this.versionVigente(id, fila.VersionActual);
        const adjuntos = await this.prisma.comComunicadoAdjuntos.findMany({
            where: { idVersion: version.idVersion },
            orderBy: { idAdjunto: 'asc' },
        });
        return {
            id: fila.idComunicado,
            estado: fila.Estado,
            tipo: {
                id: fila.ComTiposComunicado.idTipo,
                codigo: fila.ComTiposComunicado.Codigo,
                nombre: fila.ComTiposComunicado.Nombre,
                esCorto: fila.ComTiposComunicado.EsCorto,
            },
            versionActual: fila.VersionActual,
            totalDestinatarios: fila.TotalDestinatarios,
            creadoPor: fila.CreadoPor,
            fechaRegistro: fila.FechaRegistro,
            enviadoEn: fila.EnviadoEn,
            archivadoEn: fila.ArchivadoEn,
            version: {
                id: version.idVersion,
                numVersion: version.NumVersion,
                titulo: version.Titulo,
                resumen: version.Resumen,
                cuerpoHtml: version.CuerpoHtml,
                esCorreccionMenor: version.EsCorreccionMenor,
                portadaUrl: version.PortadaRuta ? this.storage.signedUrl(version.PortadaRuta, TTL_ARCHIVO, mimeDeRuta(version.PortadaRuta)) : null,
                adjuntos: adjuntos.map((adjunto) => ({
                    id: adjunto.idAdjunto,
                    nombre: adjunto.Nombre,
                    mime: adjunto.Mime,
                    tamanoBytes: adjunto.TamanoBytes,
                    url: this.storage.signedUrl(adjunto.Ruta, TTL_ARCHIVO, adjunto.Mime),
                })),
            },
            opciones: {
                prioridad: fila.Prioridad,
                acuseModo: fila.AcuseModo,
                mostrarModal: fila.MostrarModal,
                requiereIdentidad: fila.RequiereIdentidad,
                incluirNuevos: fila.IncluirNuevos,
                permitePregunta: fila.PermitePregunta,
                canalesForzados: leerCanales(fila.CanalesForzados),
                escalamiento: fila.Escalamiento ?? null,
                recordatorioCadaDias: fila.RecordatorioCadaDias,
                recordatorioMax: fila.RecordatorioMax,
                ctaTipo: fila.CtaTipo,
                ctaTexto: fila.CtaTexto,
                ctaDestino: fila.CtaDestino,
                categoria: fila.Categoria,
                idAudiencia: fila.idAudiencia,
                criteriosAudiencia: leerCriterios(fila.CriteriosAudiencia),
                programadoPara: fila.ProgramadoPara,
                vigenteHasta: fila.VigenteHasta,
            },
        };
    }

    private async autorizar(activeUser: ActiveUserDto, companyId: number) {
        await this.capabilities.contexto('COM_CREAR', activeUser, companyId);
        return this.capabilities.getEffective(activeUser, companyId);
    }

    private async visibilidad(activeUser: ActiveUserDto, companyId: number): Promise<Visibilidad> {
        const autores = [activeUser.uuid];
        try {
            const scope = await this.capabilities.contexto('COM_VER_ANALITICA', activeUser, companyId);
            if (veTodaLaEmpresa(scope, companyId)) return { todos: true, autores };
            const resultado = await this.resolver.resolve({}, scope);
            const uuids = await this.uuidsDe(resultado.ids);
            return { todos: false, autores: [...new Set([...autores, ...uuids])] };
        } catch (error) {
            if (esSinCapacidad(error)) return { todos: false, autores };
            throw error;
        }
    }

    private filtro(idTenant: number, companyId: number, visibilidad: Visibilidad, query: ListarComunicadosQuery): Prisma.ComComunicadosWhereInput {
        const termino = query.q?.trim();
        return {
            idTenant,
            idEmpresa: companyId,
            ...(visibilidad.todos ? {} : { CreadoPor: { in: visibilidad.autores } }),
            ...(query.estado ? { Estado: query.estado } : {}),
            ...(query.idTipo ? { idTipo: query.idTipo } : {}),
            ...(query.prioridad ? { Prioridad: query.prioridad } : {}),
            ...(termino
                ? { ComComunicadoVersiones: { some: { OR: [{ Titulo: { contains: termino } }, { Resumen: { contains: termino } }] } } }
                : {}),
        };
    }

    private async buscar(activeUser: ActiveUserDto, companyId: number, id: number) {
        const visibilidad = await this.visibilidad(activeUser, companyId);
        const fila = await this.prisma.comComunicados.findFirst({
            where: { ...this.filtro(activeUser.idTenant, companyId, visibilidad, {}), idComunicado: id },
            include: { ComTiposComunicado: true },
        });
        if (!fila) throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos ese comunicado.');
        return fila;
    }

    private async tipoDe(idTenant: number, idTipo: number): Promise<FilaTipo> {
        const fila = await this.prisma.comTiposComunicado.findFirst({
            where: { idTipo, idTenant, Activo: true },
        });
        if (!fila) throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos ese tipo de comunicado.');
        return fila;
    }

    private async versionVigente(idComunicado: number, numVersion: number) {
        const fila = await this.prisma.comComunicadoVersiones.findUnique({
            where: { idComunicado_NumVersion: { idComunicado, NumVersion: numVersion } },
        });
        if (!fila) throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'El comunicado no tiene versión vigente.');
        return fila;
    }

    private exigirTipo(efectivas: { codigo: string; tiposPermitidos: string[] | null }[], codigo: string): void {
        const crear = efectivas.find((item) => item.codigo === 'COM_CREAR');
        if (crear?.tiposPermitidos && !crear.tiposPermitidos.includes(codigo)) {
            throw errorComms(HttpStatus.FORBIDDEN, 'TIPO_NO_PERMITIDO', 'Tu rol no puede usar este tipo de comunicado.');
        }
    }

    private exigirCritico(efectivas: { codigo: string }[], prioridad: string, canales: readonly string[]): void {
        if (!exigeCritico(prioridad, canales)) return;
        if (!efectivas.some((item) => item.codigo === 'COM_CRITICO')) {
            throw errorComms(
                HttpStatus.FORBIDDEN,
                'PRIORIDAD_NO_PERMITIDA',
                'La prioridad crítica y WhatsApp requieren permiso de comunicados críticos.',
            );
        }
    }

    private vigenciaContraEnvio(programado: Date | null, vigente: Date | null): void {
        if (programado && vigente && vigente.getTime() <= programado.getTime()) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'La vigencia debe ser posterior al envío programado.');
        }
    }

    private async criteriosDe(
        activeUser: ActiveUserDto,
        companyId: number,
        idAudiencia: number | null | undefined,
        criteriosDto: CriteriosAudiencia | undefined,
        actuales?: unknown,
    ): Promise<{ idAudiencia: number | null; criterios: CriteriosAudiencia }> {
        if (criteriosDto) {
            await this.audienciaSiHay(activeUser.idTenant, companyId, idAudiencia);
            return { idAudiencia: idAudiencia ?? null, criterios: normalizarCriterios(criteriosDto) };
        }
        if (idAudiencia) {
            const audiencia = await this.audienciaSiHay(activeUser.idTenant, companyId, idAudiencia);
            return { idAudiencia, criterios: leerCriterios(audiencia?.Criterios) };
        }
        if (idAudiencia === null) return { idAudiencia: null, criterios: {} };
        return { idAudiencia: null, criterios: leerCriterios(actuales) };
    }

    private async audienciaSiHay(idTenant: number, companyId: number, idAudiencia: number | null | undefined) {
        if (!idAudiencia) return null;
        const fila = await this.prisma.comAudiencias.findFirst({
            where: { idAudiencia, idTenant, idEmpresa: companyId, Activo: true },
        });
        if (!fila) throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos esa audiencia.');
        return fila;
    }

    private async exigirAdjuntosDeAviso(idVersion: number): Promise<void> {
        const grandes = await this.prisma.comComunicadoAdjuntos.count({
            where: { idVersion, TamanoBytes: { gt: 2 * 1024 * 1024 } },
        });
        if (grandes) {
            throw errorComms(
                HttpStatus.BAD_REQUEST,
                'ADJUNTO_INVALIDO',
                'En un aviso operativo el adjunto no puede pasar de 2 MB.',
            );
        }
    }

    private async rutaLibre(ruta: string): Promise<boolean> {
        const [adjuntos, portadas] = await Promise.all([
            this.prisma.comComunicadoAdjuntos.count({ where: { Ruta: ruta } }),
            this.prisma.comComunicadoVersiones.count({ where: { PortadaRuta: ruta } }),
        ]);
        return adjuntos + portadas === 0;
    }

    private async copiarArchivo(ruta: string, tenant: number, empresa: number, idComunicado: number, carpeta: string): Promise<string> {
        const buffer = await this.storage.get(ruta);
        const nombre = ruta.split('/').pop() ?? 'archivo';
        return this.storage.put(buffer, { tenant, empresa, carpeta: `${idComunicado}/${carpeta}`, nombre, mime: 'application/octet-stream' });
    }

    private async uuidsDe(ids: number[]): Promise<string[]> {
        if (!ids.length) return [];
        const uuids: string[] = [];
        for (let inicio = 0; inicio < ids.length; inicio += 2000) {
            const filas = await this.prisma.empleados.findMany({
                where: { idEmpleado: { in: ids.slice(inicio, inicio + 2000) }, idUsuario: { not: null } },
                select: { idUsuario: true },
            });
            for (const fila of filas) if (fila.idUsuario) uuids.push(fila.idUsuario);
        }
        return uuids;
    }
}

function tiposDe(efectivas: { codigo: string; tiposPermitidos: string[] | null }[]): string[] | null {
    return efectivas.find((item) => item.codigo === 'COM_CREAR')?.tiposPermitidos ?? null;
}

function veTodaLaEmpresa(scope: ContextoAlcance, companyId: number): boolean {
    if (scope.alcance === 'TENANT') return true;
    return scope.alcance === 'EMPRESAS' && (scope.referencias ?? []).includes(companyId);
}

function esSinCapacidad(error: unknown): boolean {
    if (!(error instanceof HttpException)) return false;
    const body = error.getResponse();
    return typeof body === 'object' && body !== null && (body as { code?: string }).code === 'SIN_CAPACIDAD';
}

function comoEstado(valor: string): EstadoComunicado {
    if (!esEstadoComunicado(valor)) {
        throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'El comunicado está en un estado que no reconocemos.');
    }
    return valor;
}

function versionNueva(idComunicado: number, numVersion: number, contenido: ContenidoListo, creadoPor: string) {
    return {
        idComunicado,
        NumVersion: numVersion,
        Titulo: contenido.titulo,
        Resumen: contenido.resumen,
        CuerpoHtml: contenido.cuerpoHtml,
        CreadoPor: creadoPor,
    };
}

function hayCambios(dto: ActualizarComunicadoDto): boolean {
    return Object.values(dto).some((valor) => valor !== undefined);
}

function aFecha(iso: string): Date {
    const fecha = new Date(iso);
    fecha.setMilliseconds(0);
    return fecha;
}

function fechaFutura(iso: string, mensaje: string): Date {
    const fecha = aFecha(iso);
    if (fecha.getTime() <= Date.now()) throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', mensaje);
    return fecha;
}

function leerCanales(valor: unknown): string[] {
    return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : [];
}

function leerCriterios(valor: unknown): CriteriosAudiencia {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
    return normalizarCriterios(valor as CriteriosAudiencia);
}

function jsonCriterios(criterios: CriteriosAudiencia): Prisma.InputJsonValue {
    const limpio: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(criterios)) {
        if (Array.isArray(valor) && valor.length) limpio[clave] = valor;
    }
    return limpio as Prisma.InputJsonValue;
}

function jsonONull(valor: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (valor == null) return Prisma.JsonNull;
    return valor as Prisma.InputJsonValue;
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

function mesUtc(fecha: Date): string {
    return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

function rangoMes(mes: string): { desde: Date; hasta: Date } {
    const [anio, numero] = mes.split('-').map(Number);
    return { desde: new Date(Date.UTC(anio, numero - 1, 1)), hasta: new Date(Date.UTC(anio, numero, 1)) };
}

function mimeDeRuta(ruta: string): string {
    const extension = ruta.split('.').pop()?.toLowerCase();
    if (extension === 'png') return 'image/png';
    if (extension === 'webp') return 'image/webp';
    if (extension === 'gif') return 'image/gif';
    if (extension === 'pdf') return 'application/pdf';
    return 'image/jpeg';
}
