import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CampanaRealtimeService } from 'src/modules/notifications/campana-realtime.service';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { CommsPayload } from 'src/modules/notifications/interfaces/comms-dispatch.interface';
import { WhatsappProvider } from 'src/modules/notifications/providers/whatsapp/whatsapp.provider';
import { ConfigService } from '@nestjs/config';
import { MARCA_LOGIN_MOVIL, Canal, normalizarCanales } from '../channels/canales';
import { EffectiveChannelService } from '../channels/effective-channel.service';
import { leerBandera, leerNumero } from '../comms-rows';
import { esP2002 } from '../comms-http';
import { planearCanales } from '../delivery/plan-canales';
import { resolverPlantillaWhatsApp } from '../delivery/plantilla-wa';
import { FilaPrecioWa, precioVigente } from '../delivery/precio-wa';
import { SilencioEmpresa, Turno } from '../delivery/silencio';
import { whatsappBloqueado } from '../delivery/tope-wa';
import {
    COMMS_EVENTO_ESTATUS,
    HechoEstatus,
} from 'src/common/events/comms-hechos';
import { Previo, ResultadoRegla, evaluarR1, evaluarR10, evaluarR11, evaluarR2, evaluarR3, evaluarR4, evaluarR5, evaluarR6, evaluarR7, evaluarR8, evaluarR9 } from './evaluar';
import { CandidatoEnvio, aplicarPlantilla, canalesDeRecordatorio, planificarTope } from './entrega';
import { CodigoRegla, REGLAS_DEFAULT, ReglaDefault } from './reglas-default';
import { diasEntreFechas, relojLocal, zonaValida } from './zona-reloj';

interface ReglaViva extends ReglaDefault {
    activo: boolean;
    aplicaTiposPersonal: number[] | null;
    excluyeSites: number[] | null;
}

interface Persona {
    idEmpleado: number;
    idEmpresa: number;
    idTenant: number;
    userUuid: string | null;
    nombre: string;
    idSite: number | null;
    idTipoPersonal: number | null;
    telefono: string | null;
    correo: string | null;
    zona: string;
    fechaLocal: string;
    turnos: Turno[];
    canales: Canal[];
    tieneApp: boolean;
    kioscoActivo: boolean;
    idJefe: number | null;
}

interface FilaEnviado {
    idEmpleado: number;
    Codigo: string;
    Referencia: string;
    Intento: number;
    EnviadoEn: Date;
}

const IGNORAR_REGISTRO = new Set(['RECHAZADO', 'DUPLICADO']);
const VENTANA_HISTORIAL_MS = 40 * 86_400_000;

@Injectable()
export class ReminderEngineService {
    private readonly logger = new Logger(ReminderEngineService.name);
    private ocupadoMinuto = false;
    private ocupadoHora = false;
    ahora: () => Date = () => new Date();

    constructor(
        private readonly prisma: PrismaService,
        private readonly canales: EffectiveChannelService,
        private readonly dispatcher: NotificationDispatcher,
        private readonly campana: CampanaRealtimeService,
        private readonly config: ConfigService,
        @Optional() @Inject(WhatsappProvider) private readonly whatsapp?: WhatsappProvider,
    ) {}

    @Cron(CronExpression.EVERY_MINUTE)
    async tickMinuto(): Promise<void> {
        if (this.ocupadoMinuto) return;
        this.ocupadoMinuto = true;
        try {
            await this.correr('MINUTO');
        } finally {
            this.ocupadoMinuto = false;
        }
    }

    @Cron(CronExpression.EVERY_HOUR)
    async tickHora(): Promise<void> {
        if (this.ocupadoHora) return;
        this.ocupadoHora = true;
        try {
            await this.correr('HORA');
        } finally {
            this.ocupadoHora = false;
        }
    }

    /** R10 no espera al cron: el cambio de estatus se evalúa al llegar el evento. */
    @OnEvent(COMMS_EVENTO_ESTATUS)
    async onEstatus(hecho: HechoEstatus): Promise<void> {
        try {
            if (!hechoValido(hecho)) return;
            await this.estatusInmediato(hecho);
        } catch (error) {
            this.logger.error(`No se pudo evaluar R10: ${mensajeError(error)}`);
        }
    }

    private async correr(fase: 'MINUTO' | 'HORA'): Promise<void> {
        const empresas = await this.prisma.catEmpresas.findMany({
            where: { activo: true, idTenant: { not: null } },
            select: { idEmpresa: true, idTenant: true },
        });
        for (const empresa of empresas) {
            if (empresa.idTenant == null) continue;
            try {
                await this.empresa(empresa.idEmpresa, empresa.idTenant, fase);
            } catch (error) {
                this.logger.error(`Recordatorios ${fase} de la empresa ${empresa.idEmpresa}: ${mensajeError(error)}`);
            }
        }
    }

    private async empresa(idEmpresa: number, idTenant: number, fase: 'MINUTO' | 'HORA'): Promise<void> {
        const reglas = await this.reglas(idTenant, idEmpresa);
        const contexto = await this.contextoEmpresa(idEmpresa);
        const candidatos: CandidatoEnvio[] = [];
        if (fase === 'MINUTO') {
            candidatos.push(...(await this.asistencia(idEmpresa, idTenant, reglas, ['R1', 'R2'])));
        } else {
            candidatos.push(...(await this.asistencia(idEmpresa, idTenant, reglas, ['R3'])));
            candidatos.push(...(await this.documentos(idEmpresa, idTenant, reglas)));
            candidatos.push(...(await this.cursos(idEmpresa, idTenant, reglas)));
            candidatos.push(...(await this.aprobaciones(idEmpresa, idTenant, reglas)));
            candidatos.push(...(await this.comunicados(idEmpresa, idTenant, reglas)));
        }
        await this.entregar(idEmpresa, idTenant, candidatos, contexto);
    }

    private async estatusInmediato(hecho: HechoEstatus): Promise<void> {
        const reglas = await this.reglas(hecho.idTenant, hecho.idEmpresa);
        const regla = reglas.find((item) => item.codigo === 'R10');
        if (!regla) return;
        const personas = await this.personas(hecho.idEmpresa, [hecho.idEmpleado], this.ahora());
        const persona = personas.get(hecho.idEmpleado);
        if (!persona || !aplica(regla, persona)) return;
        const historial = await this.historial(hecho.idEmpresa, [hecho.idEmpleado]);
        const resultado = evaluarR10({
            companyId: hecho.idEmpresa,
            origen: hecho.origen,
            idSolicitud: hecho.idSolicitud,
            estatus: hecho.estatus,
            solicitud: hecho.solicitud,
            previos: previosDe(historial, hecho.idEmpleado, 'R10'),
            ahora: this.ahora(),
        });
        const candidato = this.candidato(persona, regla, resultado);
        if (!candidato) return;
        const contexto = await this.contextoEmpresa(hecho.idEmpresa);
        await this.entregar(hecho.idEmpresa, hecho.idTenant, [candidato], contexto);
    }

    private async asistencia(idEmpresa: number, idTenant: number, reglas: ReglaViva[], codigos: CodigoRegla[]): Promise<CandidatoEnvio[]> {
        const activas = reglas.filter((regla) => codigos.includes(regla.codigo) && regla.activo);
        if (!activas.length) return [];
        const empleados = await this.prisma.empleados.findMany({
            where: { idEmpresa, idTenant, activo: true },
            select: { idEmpleado: true },
        });
        const personas = await this.personas(idEmpresa, empleados.map((fila) => fila.idEmpleado), this.ahora());
        if (!personas.size) return [];
        const ids = [...personas.keys()];
        const ahora = this.ahora();
        const [registros, historial] = await Promise.all([
            this.prisma.registrosAsistencia.findMany({
                where: {
                    idEmpleado: { in: ids },
                    fechaHoraRegistro: { gte: new Date(ahora.getTime() - 36 * 3_600_000), lte: new Date(ahora.getTime() + 3_600_000) },
                    tipo: { in: ['ENTRADA', 'SALIDA'] },
                },
                select: { idEmpleado: true, tipo: true, fechaHoraRegistro: true, estatusProcesamiento: true },
            }),
            this.historial(idEmpresa, ids),
        ]);
        const salida: CandidatoEnvio[] = [];
        for (const persona of personas.values()) {
            const marcas = marcasDelDia(registros, persona, ahora);
            for (const turno of persona.turnos) {
                for (const regla of activas) {
                    if (!aplica(regla, persona)) continue;
                    const base = {
                        ahora,
                        zona: persona.zona,
                        companyId: idEmpresa,
                        turno: {
                            dia: turno.dia,
                            horaEntrada: turno.entrada,
                            horaSalida: turno.salida,
                            tieneEntrada: marcas.entradas.has(turno.entrada),
                            tieneSalida: marcas.salidas.has(turno.salida),
                        },
                        previos: previosDe(historial, persona.idEmpleado, regla.codigo),
                    };
                    const resultado = regla.codigo === 'R1'
                        ? evaluarR1({ ...base, minutosAntes: numero(regla.parametros, 'minutosAntes', 15) })
                        : regla.codigo === 'R2'
                            ? evaluarR2({ ...base, minutosDespues: numero(regla.parametros, 'minutosDespues', 10) })
                            : evaluarR3({ ...base, minutosDespues: numero(regla.parametros, 'minutosDespues', 30) });
                    const candidato = this.candidato(persona, regla, resultado);
                    if (candidato) salida.push(candidato);
                }
            }
        }
        return salida;
    }

    private async documentos(idEmpresa: number, idTenant: number, reglas: ReglaViva[]): Promise<CandidatoEnvio[]> {
        const r4 = reglas.find((regla) => regla.codigo === 'R4');
        const r5 = reglas.find((regla) => regla.codigo === 'R5');
        const r6 = reglas.find((regla) => regla.codigo === 'R6');
        if (![r4, r5, r6].some((regla) => regla?.activo)) return [];
        const docs = await this.prisma.documentosEmpleado.findMany({
            where: {
                idEmpleado: { not: null },
                OR: [{ idEstatusDocumento: { in: [1, 5] } }, { fechaVencimiento: { not: null } }],
            },
            take: 1000,
        });
        const ids = [...new Set(docs.map((doc) => doc.idEmpleado).filter((id): id is number => id != null))];
        const personas = await this.personas(idEmpresa, ids, this.ahora());
        const propios = docs.filter((doc) => doc.idEmpleado != null && personas.has(doc.idEmpleado));
        const catalogo = await this.nombresDocumento(propios.map((doc) => doc.IdDocumento));
        const historial = await this.historial(idEmpresa, [...personas.keys()]);
        const ahora = this.ahora();
        const salida: CandidatoEnvio[] = [];
        for (const doc of propios) {
            const persona = personas.get(doc.idEmpleado as number);
            if (!persona || persona.idTenant !== idTenant) continue;
            const nombre = catalogo.get(doc.IdDocumento ?? 0) ?? 'documento';
            const fecha = doc.fechaVencimiento ? doc.fechaVencimiento.toISOString().slice(0, 10) : null;
            const comunes = { companyId: idEmpresa, idDocumento: doc.idDocumentoEmpleado, documento: nombre, fechaLimite: fecha, ahora };
            if (doc.idEstatusDocumento === 1 && r4 && aplica(r4, persona)) {
                this.empujar(salida, persona, r4, evaluarR4({
                    ...comunes,
                    faltante: true,
                    cadaDias: numero(r4.parametros, 'cadaDias', 3),
                    maxIntentos: numero(r4.parametros, 'maxIntentos', 5),
                    previos: previosDe(historial, persona.idEmpleado, 'R4'),
                }));
            }
            if (doc.idEstatusDocumento === 5 && r6 && aplica(r6, persona)) {
                this.empujar(salida, persona, r6, evaluarR6({
                    ...comunes,
                    rechazado: true,
                    cadaDias: numero(r6.parametros, 'cadaDias', 2),
                    maxIntentos: numero(r6.parametros, 'maxIntentos', 5),
                    previos: previosDe(historial, persona.idEmpleado, 'R6'),
                }));
            }
            if (r5 && aplica(r5, persona) && doc.idEstatusDocumento !== 1 && doc.idEstatusDocumento !== 5) {
                this.empujar(salida, persona, r5, evaluarR5({
                    ...comunes,
                    cerrado: !fecha,
                    diasRestantes: fecha ? diasEntreFechas(persona.fechaLocal, fecha) : null,
                    diasAntes: numeros(r5.parametros, 'diasAntes', [30, 7, 1]),
                    previos: previosDe(historial, persona.idEmpleado, 'R5'),
                }));
            }
        }
        return salida;
    }

    private async cursos(idEmpresa: number, idTenant: number, reglas: ReglaViva[]): Promise<CandidatoEnvio[]> {
        const r7 = reglas.find((regla) => regla.codigo === 'R7');
        const r8 = reglas.find((regla) => regla.codigo === 'R8');
        if (!r7?.activo && !r8?.activo) return [];
        const filas = await this.prisma.cursoParticipantes.findMany({
            where: { CursoSesiones: { idEmpresa, estatus: { not: 'cancelado' } } },
            include: {
                CursoSesiones: { select: { idSesion: true, fechaFinPeriodo: true, CatCursos: { select: { Descripcion: true } } } },
            },
            take: 1000,
        });
        const personas = await this.personas(idEmpresa, filas.map((fila) => fila.idEmpleado), this.ahora());
        const historial = await this.historial(idEmpresa, [...personas.keys()]);
        const ahora = this.ahora();
        const salida: CandidatoEnvio[] = [];
        for (const fila of filas) {
            const persona = personas.get(fila.idEmpleado);
            if (!persona || persona.idTenant !== idTenant) continue;
            const curso = fila.CursoSesiones.CatCursos?.Descripcion ?? 'curso';
            const fechaLimite = fila.CursoSesiones.fechaFinPeriodo
                ? relojLocal(fila.CursoSesiones.fechaFinPeriodo, persona.zona).fecha
                : null;
            if (r7?.activo && aplica(r7, persona)) {
                this.empujar(salida, persona, r7, evaluarR7({
                    companyId: idEmpresa,
                    idSesion: fila.idSesion,
                    curso,
                    estatus: fila.estatusAsignacion,
                    fechaLimite,
                    previos: previosDe(historial, persona.idEmpleado, 'R7'),
                    ahora,
                    cadaDias: numero(r7.parametros, 'cadaDias', 1),
                    maxIntentos: numero(r7.parametros, 'maxIntentos', 3),
                }));
            }
            if (r8?.activo && aplica(r8, persona)) {
                this.empujar(salida, persona, r8, evaluarR8({
                    companyId: idEmpresa,
                    idSesion: fila.idSesion,
                    curso,
                    estatus: fila.estatusAsignacion,
                    fechaLimite,
                    diasRestantes: fechaLimite ? diasEntreFechas(persona.fechaLocal, fechaLimite) : null,
                    diasAntes: numero(r8.parametros, 'diasAntes', 3),
                    cadaDias: numero(r8.parametros, 'cadaDias', 1),
                    maxIntentos: numero(r8.parametros, 'maxIntentos', 5),
                    previos: previosDe(historial, persona.idEmpleado, 'R8'),
                    ahora,
                }));
            }
        }
        return salida;
    }

    private async aprobaciones(idEmpresa: number, idTenant: number, reglas: ReglaViva[]): Promise<CandidatoEnvio[]> {
        const regla = reglas.find((item) => item.codigo === 'R9');
        if (!regla?.activo) return [];
        const [incidencias, movimientos] = await Promise.all([
            this.prisma.solicitudesIncidencias.findMany({
                where: { idEmpresa, idTenant, estatus: 'PENDIENTE' },
                select: { idSolicitud: true, idEmpleado: true, idAprobador: true, pasoActual: true },
                take: 300,
            }),
            this.prisma.movimientosInternos.findMany({
                where: { idEmpresa, idTenant, estatus: 'PENDIENTE' },
                select: { idMovimiento: true, idEmpleado: true, idAprobador: true, pasoActual: true },
                take: 300,
            }),
        ]);
        const sujetos = [...incidencias.map((fila) => fila.idEmpleado), ...movimientos.map((fila) => fila.idEmpleado)];
        const personas = await this.personas(idEmpresa, sujetos, this.ahora());
        const destinatarios = new Map<number, number>();
        for (const fila of incidencias) {
            const sujeto = personas.get(fila.idEmpleado);
            const id = fila.idAprobador ?? sujeto?.idJefe ?? null;
            if (id) destinatarios.set(fila.idSolicitud, id);
        }
        for (const fila of movimientos) {
            const sujeto = personas.get(fila.idEmpleado);
            const id = fila.idAprobador ?? sujeto?.idJefe ?? null;
            if (id) destinatarios.set(fila.idMovimiento, id);
        }
        const quienes = await this.personas(idEmpresa, [...new Set(destinatarios.values())], this.ahora());
        const historial = await this.historial(idEmpresa, [...quienes.keys()]);
        const ahora = this.ahora();
        const salida: CandidatoEnvio[] = [];
        for (const fila of incidencias) {
            const persona = quienes.get(destinatarios.get(fila.idSolicitud) ?? 0);
            if (!persona || !aplica(regla, persona)) continue;
            this.empujar(salida, persona, regla, evaluarR9({
                companyId: idEmpresa,
                origen: 'INCIDENCIA',
                idSolicitud: fila.idSolicitud,
                paso: fila.pasoActual,
                estatus: 'PENDIENTE',
                solicitud: `solicitud #${fila.idSolicitud}`,
                cadaDias: numero(regla.parametros, 'cadaDias', 1),
                maxIntentos: numero(regla.parametros, 'maxIntentos', 5),
                previos: previosDe(historial, persona.idEmpleado, 'R9'),
                ahora,
            }));
        }
        for (const fila of movimientos) {
            const persona = quienes.get(destinatarios.get(fila.idMovimiento) ?? 0);
            if (!persona || !aplica(regla, persona)) continue;
            this.empujar(salida, persona, regla, evaluarR9({
                companyId: idEmpresa,
                origen: 'MOVIMIENTO_INTERNO',
                idSolicitud: fila.idMovimiento,
                paso: fila.pasoActual,
                estatus: 'PENDIENTE',
                solicitud: `movimiento #${fila.idMovimiento}`,
                cadaDias: numero(regla.parametros, 'cadaDias', 1),
                maxIntentos: numero(regla.parametros, 'maxIntentos', 5),
                previos: previosDe(historial, persona.idEmpleado, 'R9'),
                ahora,
            }));
        }
        return salida;
    }

    private async comunicados(idEmpresa: number, idTenant: number, reglas: ReglaViva[]): Promise<CandidatoEnvio[]> {
        const regla = reglas.find((item) => item.codigo === 'R11');
        if (!regla?.activo) return [];
        const destinos = await this.prisma.comDestinatarios.findMany({
            where: {
                Estado: { in: ['PENDIENTE', 'ENTREGADO', 'LEIDO'] },
                ComComunicados: {
                    idEmpresa,
                    idTenant,
                    Estado: 'ENVIADO',
                    RecordatorioCadaDias: { not: null },
                    RecordatorioMax: { gt: 0 },
                },
            },
            select: {
                idDestinatario: true,
                idEmpleado: true,
                Estado: true,
                ComComunicados: {
                    select: {
                        idComunicado: true,
                        Estado: true,
                        AcuseModo: true,
                        VigenteHasta: true,
                        RecordatorioCadaDias: true,
                        RecordatorioMax: true,
                        VersionActual: true,
                        ComComunicadoVersiones: { select: { NumVersion: true, Titulo: true } },
                    },
                },
            },
            take: 500,
        });
        const personas = await this.personas(idEmpresa, destinos.map((fila) => fila.idEmpleado), this.ahora());
        const historial = await this.historial(idEmpresa, [...personas.keys()]);
        const ahora = this.ahora();
        const salida: CandidatoEnvio[] = [];
        for (const destino of destinos) {
            const persona = personas.get(destino.idEmpleado);
            const comunicado = destino.ComComunicados;
            if (!persona || !aplica(regla, persona)) continue;
            const version = comunicado.ComComunicadoVersiones.find((item) => item.NumVersion === comunicado.VersionActual);
            const titulo = version?.Titulo ?? 'Comunicado';
            const resultado = evaluarR11({
                companyId: idEmpresa,
                idComunicado: comunicado.idComunicado,
                estadoComunicado: comunicado.Estado,
                acuseModo: comunicado.AcuseModo,
                estadoDestinatario: destino.Estado,
                vigente: !comunicado.VigenteHasta || comunicado.VigenteHasta.getTime() > ahora.getTime(),
                cadaDias: comunicado.RecordatorioCadaDias,
                maxIntentos: comunicado.RecordatorioMax,
                solicitud: titulo,
                previos: previosDe(historial, persona.idEmpleado, 'R11'),
                ahora,
            });
            const candidato = this.candidato(persona, regla, resultado, destino.idDestinatario);
            if (candidato) {
                candidato.titulo = titulo;
                salida.push(candidato);
            }
        }
        return salida;
    }

    private async entregar(
        idEmpresa: number,
        idTenant: number,
        candidatos: CandidatoEnvio[],
        contexto: { silencio: SilencioEmpresa; plantillas: unknown; limite: number },
    ): Promise<void> {
        if (!candidatos.length) return;
        const ahora = this.ahora();
        const historial = await this.historial(idEmpresa, candidatos.map((item) => item.idEmpleado));
        const frescos = candidatos.filter((candidato) => !yaEnviado(historial, candidato));
        const hoy = enviadosHoy(historial, frescos, ahora);
        const plan = planificarTope(frescos, hoy, contexto.limite);
        const turnos = await this.turnosDe(frescos.map((item) => item.idEmpleado));
        for (const candidato of plan.individuales) {
            if (this.esperaSilencio(candidato, turnos.get(candidato.idEmpleado) ?? [], contexto.silencio, ahora)) continue;
            if (await this.registrar(candidato, ahora)) await this.despachar(candidato, contexto.plantillas, idTenant, ahora, null);
        }
        for (const grupo of plan.grupos) {
            let nuevos = 0;
            for (const item of grupo.items) {
                if (this.esperaSilencio(item, turnos.get(item.idEmpleado) ?? [], contexto.silencio, ahora)) continue;
                if (await this.registrar(item, ahora)) nuevos += 1;
            }
            if (!nuevos) continue;
            const muestra = grupo.items[0];
            await this.publicarGrupo(muestra, grupo.mensaje, grupo.clave, contexto.plantillas, idTenant);
        }
    }

    private async publicarGrupo(muestra: CandidatoEnvio, mensaje: string, clave: string, plantillas: unknown, idTenant: number): Promise<void> {
        const aviso = { ...muestra, titulo: 'Tienes pendientes', mensaje };
        if (!muestra.userUuid) {
            await this.despachar(aviso, plantillas, idTenant, this.ahora(), clave);
            return;
        }
        const previa = await this.prisma.notificaciones.findFirst({
            where: { user_uuid: muestra.userUuid, idEmpresa: muestra.idEmpresa, ClaveAgrupacion: clave },
        });
        if (previa) {
            await this.prisma.notificaciones.update({
                where: { id: previa.id },
                data: { title: 'Tienes pendientes', message: mensaje, read_at: null },
            });
            await this.campana.publicar(muestra.userUuid, muestra.idEmpresa, idTenant, {
                id: previa.id,
                titulo: 'Tienes pendientes',
                mensaje,
                categoria: 'RECORDATORIO',
                prioridad: 'NORMAL',
                deepLink: muestra.deepLink,
                creadoEn: this.ahora(),
                leida: false,
            });
            return;
        }
        await this.despachar(aviso, plantillas, idTenant, this.ahora(), clave);
    }

    private async despachar(candidato: CandidatoEnvio, plantillas: unknown, idTenant: number, ahora: Date, clave: string | null): Promise<void> {
        const plantillaWa = resolverPlantillaWhatsApp(plantillas, candidato.codigo, 'NORMAL')
            ?? resolverPlantillaWhatsApp(plantillas, 'RECORDATORIO', 'NORMAL');
        let canales = candidato.canales;
        if (canales.includes('WHATSAPP') && (!plantillaWa || (await this.whatsappBloqueado(idTenant, candidato.idEmpresa, ahora)))) {
            canales = canales.filter((canal) => canal !== 'WHATSAPP');
        }
        const planes = planearCanales({
            canales,
            prioridad: 'NORMAL',
            ahora,
            zonaHoraria: candidato.zona,
            turnos: candidato.inmediato ? [] : [],
            silencio: candidato.inmediato ? { activo: false, inicio: '21:00', fin: '07:00' } : null,
        }).filter((plan) => plan.enviarAhora && plan.codigo !== 'KIOSCO');
        if (!planes.length) return;
        const enlace = this.enlace(candidato.deepLink);
        const payload: CommsPayload = {
            userUuid: candidato.userUuid ?? '',
            titulo: candidato.titulo,
            mensaje: candidato.mensaje,
            categoria: candidato.codigo === 'R9' || candidato.codigo === 'R10' ? 'APROBACION' : 'RECORDATORIO',
            prioridad: 'NORMAL',
            deepLink: candidato.deepLink,
            origenTipo: 'RECORDATORIO',
            origenId: `${candidato.codigo}:${candidato.referencia}`.slice(0, 40),
            idTenant,
            idEmpresa: candidato.idEmpresa,
            notificationTypeCode: 'RECORDATORIO',
            claveAgrupacion: clave,
            correo: candidato.correo
                ? { to: candidato.correo, context: { nombre: variablesNombre(candidato.mensaje), titulo: candidato.titulo, resumen: candidato.mensaje, enlace } }
                : undefined,
            whatsapp: candidato.telefono && plantillaWa
                ? { phone: candidato.telefono, templateId: plantillaWa, params: [candidato.titulo, candidato.mensaje] }
                : undefined,
            push: {
                title: candidato.titulo,
                body: candidato.mensaje,
                data: { deepLink: candidato.deepLink, deepLinkApp: candidato.deepLinkApp },
            },
        };
        if (!candidato.userUuid) {
            if (payload.whatsapp && planes.some((plan) => plan.codigo === 'WHATSAPP')) {
                await this.enviarWhatsapp(candidato, payload.whatsapp.templateId, ahora, idTenant);
            }
            return;
        }
        const resultado = await this.dispatcher.dispatchComms({ userUuid: candidato.userUuid }, payload, planes);
        const whatsapp = resultado.entregas.find((entrega) => entrega.canal === 'WHATSAPP' && entrega.status === 'SENT');
        if (whatsapp && payload.whatsapp) await this.registrarConsumo(candidato, idTenant, payload.whatsapp.templateId, whatsapp.proveedorMsgId, ahora, resultado.notificationId);
    }

    private async enviarWhatsapp(candidato: CandidatoEnvio, plantilla: string, ahora: Date, idTenant: number): Promise<void> {
        if (!this.whatsapp || !candidato.telefono) return;
        try {
            await this.whatsapp.send(
                {
                    userUuid: candidato.userUuid ?? `empleado:${candidato.idEmpleado}`,
                    notificationTypeCode: 'RECORDATORIO',
                    phone: candidato.telefono,
                    subject: candidato.titulo,
                    context: { params: [candidato.titulo, candidato.mensaje] },
                },
                plantilla,
            );
            await this.registrarConsumo(candidato, idTenant, plantilla, undefined, ahora, null);
        } catch (error) {
            this.logger.warn(`WhatsApp de recordatorio no salió para ${candidato.idEmpleado}: ${mensajeError(error)}`);
        }
    }

    private async registrar(candidato: CandidatoEnvio, ahora: Date): Promise<boolean> {
        try {
            await this.prisma.comRecordatoriosEnviados.create({
                data: {
                    idEmpresa: candidato.idEmpresa,
                    Codigo: candidato.codigo,
                    idEmpleado: candidato.idEmpleado,
                    Referencia: candidato.referencia.slice(0, 80),
                    Intento: candidato.intento,
                    EnviadoEn: ahora,
                },
            });
        } catch (error) {
            if (esP2002(error)) return false;
            throw error;
        }
        if (candidato.codigo === 'R11' && candidato.idDestinatario) {
            await this.prisma.comDestinatarios.update({
                where: { idDestinatario: candidato.idDestinatario },
                data: { RecordatoriosEnviados: { increment: 1 }, UltimoIntentoEn: ahora },
            });
        }
        return true;
    }

    private esperaSilencio(candidato: CandidatoEnvio, turnos: Turno[], silencio: SilencioEmpresa, ahora: Date): boolean {
        if (candidato.inmediato) return false;
        const planes = planearCanales({
            canales: candidato.canales,
            prioridad: 'NORMAL',
            ahora,
            zonaHoraria: candidato.zona,
            turnos,
            silencio,
        });
        return planes.some((plan) => !plan.enviarAhora && plan.codigo !== 'KIOSCO' && plan.codigo !== 'SOCKETS');
    }

    private async personas(idEmpresa: number, ids: number[], ahora: Date): Promise<Map<number, Persona>> {
        const unicos = [...new Set(ids)];
        const mapa = new Map<number, Persona>();
        if (!unicos.length) return mapa;
        const filas = await this.prisma.empleados.findMany({
            where: { idEmpleado: { in: unicos }, idEmpresa, activo: true },
            select: {
                idEmpleado: true,
                idEmpresa: true,
                idTenant: true,
                idUsuario: true,
                nombre: true,
                primerApellido: true,
                idSite: true,
                idTipoPersonalOverride: true,
                telefonoMovil: true,
                correo: true,
                idJefeInmediato: true,
                CatPuestos: { select: { idTipoPersonal: true } },
            },
        });
        if (!filas.length) return mapa;
        const sites = [...new Set(filas.map((fila) => fila.idSite).filter((id): id is number => id != null))];
        const zonas = sites.length
            ? await this.prisma.catSites.findMany({ where: { idSite: { in: sites } }, select: { idSite: true, zonaHoraria: true } })
            : [];
        const [horarios, marcas, efectivos] = await Promise.all([
            this.prisma.horariosEmpleado.findMany({
                where: { idEmpleado: { in: filas.map((fila) => fila.idEmpleado) } },
                select: { idEmpleado: true, DiaSemana: true, HoraEntrada: true, HoraSalida: true },
            }),
            this.marcas(filas.map((fila) => fila.idEmpleado)),
            this.canales.forEmployees(filas.map((fila) => fila.idEmpleado), idEmpresa),
        ]);
        const zonaDe = new Map<number, string>();
        for (const site of zonas) zonaDe.set(site.idSite, zonaValida(site.zonaHoraria));
        const canalesDe = new Map(efectivos.porEmpleado.map((fila) => [fila.idEmpleado, fila.canales]));
        for (const fila of filas) {
            if (fila.idEmpresa == null || fila.idTenant == null) continue;
            const zona = fila.idSite != null ? zonaDe.get(fila.idSite) ?? 'America/Mexico_City' : 'America/Mexico_City';
            const reloj = relojLocal(ahora, zona);
            const marca = marcas.get(fila.idEmpleado);
            mapa.set(fila.idEmpleado, {
                idEmpleado: fila.idEmpleado,
                idEmpresa: fila.idEmpresa,
                idTenant: fila.idTenant,
                userUuid: fila.idUsuario,
                nombre: [fila.nombre, fila.primerApellido].filter((parte) => parte && parte.trim()).join(' ').trim() || 'colaborador',
                idSite: fila.idSite,
                idTipoPersonal: fila.idTipoPersonalOverride ?? fila.CatPuestos?.idTipoPersonal ?? null,
                telefono: fila.telefonoMovil,
                correo: fila.correo,
                zona,
                fechaLocal: reloj.fecha,
                turnos: horarios
                    .filter((horario) => horario.idEmpleado === fila.idEmpleado)
                    .flatMap((horario) => {
                        const entrada = minutosHora(horario.HoraEntrada);
                        const salida = minutosHora(horario.HoraSalida);
                        if (!horario.DiaSemana || entrada == null || salida == null) return [];
                        return [{ dia: horario.DiaSemana, entrada, salida }];
                    }),
                canales: canalesDe.get(fila.idEmpleado) ?? [],
                tieneApp: Boolean(marca?.pushActivo || marca?.loginMovil),
                kioscoActivo: Boolean(marca?.kioscoActivo),
                idJefe: fila.idJefeInmediato,
            });
        }
        return mapa;
    }

    private async marcas(ids: number[]): Promise<Map<number, { pushActivo: boolean; loginMovil: boolean; kioscoActivo: boolean }>> {
        const mapa = new Map<number, { pushActivo: boolean; loginMovil: boolean; kioscoActivo: boolean }>();
        if (!ids.length) return mapa;
        const filas = await this.prisma.$queryRaw<object[]>(Prisma.sql`
            SELECT e.idEmpleado AS idEmpleado,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM PushTokens t
                       WHERE t.Activo = 1 AND t.FechaBaja IS NULL
                         AND (t.idEmpleado = e.idEmpleado OR (e.idUsuario IS NOT NULL AND t.user_uuid = e.idUsuario))
                   ) THEN 1 ELSE 0 END AS pushActivo,
                   CASE WHEN e.idUsuario IS NOT NULL AND EXISTS (
                       SELECT 1 FROM usuarioslogin l
                       WHERE l.UuidUsuario = e.idUsuario AND l.browser = ${MARCA_LOGIN_MOVIL}
                   ) THEN 1 ELSE 0 END AS loginMovil,
                   CASE WHEN e.idSite IS NOT NULL AND EXISTS (
                       SELECT 1 FROM KioscoSites ks
                       INNER JOIN KioscosAsistencia k ON k.idKiosco = ks.idKiosco
                       WHERE ks.idSite = e.idSite AND k.estatus = 'ACTIVO' AND k.fechaBaja IS NULL AND k.idTenant = e.idTenant
                   ) THEN 1 ELSE 0 END AS kioscoActivo
            FROM Empleados e
            WHERE e.idEmpleado IN (${Prisma.join(ids)})
        `);
        for (const fila of filas) {
            mapa.set(leerNumero(fila, 'idEmpleado'), {
                pushActivo: leerBandera(fila, 'pushActivo'),
                loginMovil: leerBandera(fila, 'loginMovil'),
                kioscoActivo: leerBandera(fila, 'kioscoActivo'),
            });
        }
        return mapa;
    }

    private async turnosDe(ids: number[]): Promise<Map<number, Turno[]>> {
        const personas = await this.prisma.horariosEmpleado.findMany({
            where: { idEmpleado: { in: [...new Set(ids)] } },
            select: { idEmpleado: true, DiaSemana: true, HoraEntrada: true, HoraSalida: true },
        });
        const mapa = new Map<number, Turno[]>();
        for (const fila of personas) {
            const entrada = minutosHora(fila.HoraEntrada);
            const salida = minutosHora(fila.HoraSalida);
            if (!fila.DiaSemana || entrada == null || salida == null) continue;
            const lista = mapa.get(fila.idEmpleado) ?? [];
            lista.push({ dia: fila.DiaSemana, entrada, salida });
            mapa.set(fila.idEmpleado, lista);
        }
        return mapa;
    }

    private async historial(idEmpresa: number, ids: number[]): Promise<FilaEnviado[]> {
        const unicos = [...new Set(ids)];
        if (!unicos.length) return [];
        return this.prisma.comRecordatoriosEnviados.findMany({
            where: { idEmpresa, idEmpleado: { in: unicos }, EnviadoEn: { gte: new Date(this.ahora().getTime() - VENTANA_HISTORIAL_MS) } },
            select: { idEmpleado: true, Codigo: true, Referencia: true, Intento: true, EnviadoEn: true },
        });
    }

    private async reglas(idTenant: number, idEmpresa: number): Promise<ReglaViva[]> {
        const filas = await this.prisma.comReglasRecordatorio.findMany({ where: { idEmpresa, idTenant } });
        const porCodigo = new Map(filas.map((fila) => [fila.Codigo, fila]));
        return REGLAS_DEFAULT.map((base) => {
            const fila = porCodigo.get(base.codigo);
            if (!fila) return { ...base, activo: true, aplicaTiposPersonal: null, excluyeSites: null };
            const canales = normalizarCanales(fila.Canales);
            return {
                codigo: base.codigo,
                nombre: base.nombre,
                activo: fila.Activo,
                parametros: objeto(fila.Parametros),
                canales: canales.length ? canales : base.canales,
                plantilla: fila.Plantilla?.trim() || base.plantilla,
                aplicaTiposPersonal: listaIds(fila.AplicaTiposPersonal),
                excluyeSites: listaIds(fila.ExcluyeSites),
            };
        });
    }

    private async contextoEmpresa(idEmpresa: number): Promise<{ silencio: SilencioEmpresa; plantillas: unknown; limite: number }> {
        const fila = await this.prisma.comConfigEmpresa.findUnique({ where: { idEmpresa } });
        return {
            limite: fila?.LimiteDiarioRecordatorios ?? 5,
            plantillas: fila?.PlantillasWhatsApp ?? null,
            silencio: {
                activo: fila?.SilencioActivo ?? true,
                inicio: fila?.SilencioInicio ?? '21:00',
                fin: fila?.SilencioFin ?? '07:00',
            },
        };
    }

    private async nombresDocumento(ids: Array<number | null>): Promise<Map<number, string>> {
        const unicos = [...new Set(ids.filter((id): id is number => id != null))];
        if (!unicos.length) return new Map();
        const filas = await this.prisma.catDocumentos.findMany({
            where: { IdDocumento: { in: unicos } },
            select: { IdDocumento: true, Descripcion: true },
        });
        return new Map(filas.map((fila) => [fila.IdDocumento, fila.Descripcion?.trim() || 'documento']));
    }

    private async whatsappBloqueado(idTenant: number, idEmpresa: number, ahora: Date): Promise<boolean> {
        const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
        const [suma, topes] = await Promise.all([
            this.prisma.waConsumo.aggregate({
                where: { idTenant, idEmpresa, EnviadoEn: { gte: inicio } },
                _sum: { Costo: true },
            }),
            this.prisma.waTopes.findMany({ where: { idTenant, Activo: true, OR: [{ idEmpresa }, { idEmpresa: null }] } }),
        ]);
        const propio = topes.find((tope) => tope.idEmpresa === idEmpresa) ?? topes.find((tope) => tope.idEmpresa == null);
        return whatsappBloqueado({
            prioridad: 'NORMAL',
            consumo: Number(suma._sum.Costo ?? 0),
            tope: propio ? Number(propio.TopeMensual) : null,
            accion: propio?.Accion ?? null,
        });
    }

    private async registrarConsumo(
        candidato: CandidatoEnvio,
        idTenant: number,
        plantilla: string,
        proveedorMsgId: string | undefined,
        ahora: Date,
        idEntrega: string | null,
    ): Promise<void> {
        const filas = await this.prisma.waPrecios.findMany({
            where: { VigenteDesde: { lte: ahora }, OR: [{ idTenant }, { idTenant: null }] },
        });
        const precios: FilaPrecioWa[] = filas.map((fila) => ({
            idTenant: fila.idTenant,
            precioBase: Number(fila.PrecioBase),
            preciosCategoria: fila.PreciosCategoria,
            moneda: fila.Moneda,
            vigenteDesde: fila.VigenteDesde,
        }));
        const precio = precioVigente(precios, idTenant, ahora, 'RECORDATORIO') ?? { precio: 0, moneda: 'MXN' };
        const telefono = (candidato.telefono ?? '').replace(/\D/g, '');
        await this.prisma.waConsumo.create({
            data: {
                idTenant,
                idEmpresa: candidato.idEmpresa,
                idEntrega,
                Plantilla: plantilla.slice(0, 80),
                CategoriaInterna: 'RECORDATORIO',
                CategoriaMeta: 'UTILITY',
                OrigenTipo: 'RECORDATORIO',
                OrigenId: `${candidato.codigo}:${candidato.idEmpleado}`.slice(0, 40),
                TelefonoUlt4: telefono.slice(-4).padStart(4, '0'),
                ProveedorMsgId: proveedorMsgId ?? null,
                Estatus: 'ENVIADO',
                PrecioUnitario: precio.precio,
                Moneda: precio.moneda,
                Costo: precio.precio,
                EnviadoEn: ahora,
            },
        });
    }

    private candidato(persona: Persona, regla: ReglaViva, resultado: ResultadoRegla, idDestinatario?: number): CandidatoEnvio | null {
        if (resultado.accion !== 'enviar' || resultado.intento == null) return null;
        const canales = canalesDeRecordatorio({
            codigo: regla.codigo,
            canalesRegla: regla.canales,
            canalesEfectivos: persona.canales,
            tieneApp: persona.tieneApp,
            kioscoActivo: persona.kioscoActivo,
        });
        if (!canales.length) return null;
        return {
            idEmpleado: persona.idEmpleado,
            idEmpresa: persona.idEmpresa,
            idTenant: persona.idTenant,
            userUuid: persona.userUuid,
            codigo: regla.codigo,
            referencia: resultado.referencia,
            intento: resultado.intento,
            titulo: regla.codigo === 'R11' && resultado.variables.solicitud ? resultado.variables.solicitud : regla.nombre,
            mensaje: aplicarPlantilla(regla.plantilla, { nombre: persona.nombre, ...resultado.variables }),
            deepLink: resultado.deepLink,
            deepLinkApp: resultado.deepLinkApp,
            canales,
            telefono: persona.telefono,
            correo: persona.correo,
            zona: persona.zona,
            fechaLocal: persona.fechaLocal,
            idDestinatario,
            inmediato: regla.codigo === 'R1' || regla.codigo === 'R2' || regla.codigo === 'R3' || regla.codigo === 'R10',
        };
    }

    private empujar(salida: CandidatoEnvio[], persona: Persona, regla: ReglaViva, resultado: ResultadoRegla): void {
        const candidato = this.candidato(persona, regla, resultado);
        if (candidato) salida.push(candidato);
    }

    private enlace(ruta: string): string {
        const base = this.config.get<string>('FRONT_URL')?.replace(/\/$/, '') ?? '';
        return base ? `${base}${ruta}` : ruta;
    }
}

function marcasDelDia(
    registros: { idEmpleado: number; tipo: string; fechaHoraRegistro: Date; estatusProcesamiento: string }[],
    persona: Persona,
    ahora: Date,
): { entradas: Set<number>; salidas: Set<number> } {
    const entradas = new Set<number>();
    const salidas = new Set<number>();
    for (const registro of registros) {
        if (registro.idEmpleado !== persona.idEmpleado) continue;
        if (IGNORAR_REGISTRO.has(registro.estatusProcesamiento)) continue;
        if (relojLocal(registro.fechaHoraRegistro, persona.zona).fecha !== relojLocal(ahora, persona.zona).fecha) continue;
        const minutos = relojLocal(registro.fechaHoraRegistro, persona.zona).minutos;
        if (registro.tipo === 'ENTRADA') entradas.add(minutosCercano(persona.turnos, minutos, 'entrada'));
        if (registro.tipo === 'SALIDA') salidas.add(minutosCercano(persona.turnos, minutos, 'salida'));
    }
    if (entradas.size) {
        for (const turno of persona.turnos) entradas.add(turno.entrada);
    }
    if (salidas.size) {
        for (const turno of persona.turnos) salidas.add(turno.salida);
    }
    return { entradas, salidas };
}

function minutosCercano(turnos: Turno[], minutos: number, cual: 'entrada' | 'salida'): number {
    const marcas = turnos.map((turno) => (cual === 'entrada' ? turno.entrada : turno.salida));
    return marcas.sort((a, b) => Math.abs(a - minutos) - Math.abs(b - minutos))[0] ?? minutos;
}

function previosDe(filas: FilaEnviado[], idEmpleado: number, codigo: string): Previo[] {
    return filas
        .filter((fila) => fila.idEmpleado === idEmpleado && fila.Codigo === codigo)
        .map((fila) => ({ referencia: fila.Referencia, intento: fila.Intento, enviadoEn: fila.EnviadoEn }));
}

function yaEnviado(filas: FilaEnviado[], candidato: CandidatoEnvio): boolean {
    return filas.some((fila) => fila.idEmpleado === candidato.idEmpleado
        && fila.Codigo === candidato.codigo
        && fila.Referencia === candidato.referencia
        && fila.Intento === candidato.intento);
}

function enviadosHoy(filas: FilaEnviado[], candidatos: CandidatoEnvio[], ahora: Date): Map<number, number> {
    const zonas = new Map(candidatos.map((candidato) => [candidato.idEmpleado, candidato.zona]));
    const mapa = new Map<number, number>();
    for (const fila of filas) {
        const zona = zonas.get(fila.idEmpleado);
        if (!zona) continue;
        if (relojLocal(fila.EnviadoEn, zona).fecha !== relojLocal(ahora, zona).fecha) continue;
        mapa.set(fila.idEmpleado, (mapa.get(fila.idEmpleado) ?? 0) + 1);
    }
    return mapa;
}

function aplica(regla: ReglaViva, persona: Persona): boolean {
    if (!regla.activo) return false;
    if (persona.idSite != null && regla.excluyeSites?.includes(persona.idSite)) return false;
    if (regla.aplicaTiposPersonal?.length && (persona.idTipoPersonal == null || !regla.aplicaTiposPersonal.includes(persona.idTipoPersonal))) {
        return false;
    }
    return true;
}

function numero(parametros: Record<string, unknown>, campo: string, defecto: number): number {
    const valor = parametros[campo];
    return typeof valor === 'number' && Number.isInteger(valor) ? valor : defecto;
}

function numeros(parametros: Record<string, unknown>, campo: string, defecto: number[]): number[] {
    const valor = parametros[campo];
    if (!Array.isArray(valor)) return defecto;
    const lista = valor.filter((item): item is number => typeof item === 'number' && Number.isInteger(item));
    return lista.length ? lista : defecto;
}

function objeto(valor: unknown): Record<string, unknown> {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
    return valor as Record<string, unknown>;
}

function listaIds(valor: unknown): number[] | null {
    if (!Array.isArray(valor)) return null;
    const ids = valor.filter((item): item is number => Number.isInteger(item) && (item as number) > 0);
    return ids.length ? ids : null;
}

function minutosHora(valor: Date | null): number | null {
    if (!valor || Number.isNaN(valor.getTime())) return null;
    return valor.getUTCHours() * 60 + valor.getUTCMinutes();
}

function hechoValido(hecho: HechoEstatus): boolean {
    return !!hecho
        && Number.isInteger(hecho.idEmpresa)
        && Number.isInteger(hecho.idTenant)
        && Number.isInteger(hecho.idEmpleado)
        && Number.isInteger(hecho.idSolicitud)
        && typeof hecho.estatus === 'string'
        && typeof hecho.origen === 'string'
        && typeof hecho.solicitud === 'string';
}

function variablesNombre(mensaje: string): string {
    const corte = mensaje.split(',')[0]?.trim();
    return corte || 'colaborador';
}

function mensajeError(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
}
