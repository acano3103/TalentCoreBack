import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { presentarAdjunto, presentarPortada } from '../announcements/archivo-publico';
import { aTextoPlano } from '../announcements/sanitize-cuerpo';
import { CommsStorageService } from '../announcements/comms-storage.service';
import { errorComms } from '../comms-http';
import { hashToken } from '../delivery/enlace-seguro';
import { esVigente } from '../me/bandeja';
import { CommsAckService } from '../me/comms-ack.service';
import { fechasCoinciden } from './fecha-nacimiento';

const BLOQUEO_MS = 30 * 60 * 1000;
const MAX_INTENTOS = 3;
const JWT_MS = 15 * 60 * 1000;
const TTL_ARCHIVO = 60 * 60;
const ZONA_DEFAULT = 'America/Mexico_City';

export interface ContextoEnlace {
    ip: string | null;
    userAgent: string | null;
    autorizacion?: string;
}

@Injectable()
export class PublicLinksService {
    ahora: () => Date = () => new Date();

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwt: JwtService,
        private readonly ack: CommsAckService,
        private readonly storage: CommsStorageService,
    ) {}

    async metadatos(token: string) {
        const enlace = await this.resolver(token);
        return {
            titulo: enlace.version.Titulo,
            resumen: enlace.version.Resumen,
            empresa: enlace.empresa,
            requiereIdentidad: enlace.requiereIdentidad,
            acuseModo: enlace.acuseModo,
            expiraEn: enlace.expiraEn,
            bloqueadoHasta: enlace.bloqueadoHasta,
            vigente: esVigente(enlace.estado, enlace.vigenteHasta, this.ahora()),
        };
    }

    async verificar(token: string, fechaNacimiento: string) {
        const enlace = await this.resolver(token);
        if (!enlace.requiereIdentidad) {
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Este enlace no pide una fecha de nacimiento.');
        }
        this.exigirLibre(enlace);
        const ahora = this.ahora();
        const base = enlace.bloqueadoHasta && enlace.bloqueadoHasta.getTime() <= ahora.getTime() ? 0 : enlace.intentos;
        if (!fechasCoinciden(enlace.fechaNacimiento, fechaNacimiento)) {
            const intentos = base + 1;
            const bloquear = intentos >= MAX_INTENTOS;
            const bloqueadoHasta = bloquear ? new Date(ahora.getTime() + BLOQUEO_MS) : null;
            await this.prisma.comEnlacesSeguros.update({
                where: { idEnlace: enlace.idEnlace },
                data: { Intentos: intentos, BloqueadoHasta: bloqueadoHasta },
            });
            throw errorComms(HttpStatus.BAD_REQUEST, 'IDENTIDAD_NO_VALIDA', 'La fecha de nacimiento no coincide.', {
                intentosRestantes: Math.max(0, MAX_INTENTOS - intentos),
            });
        }
        await this.prisma.comEnlacesSeguros.update({
            where: { idEnlace: enlace.idEnlace },
            data: { VerificadoEn: ahora, Intentos: 0, BloqueadoHasta: null },
        });
        const acceso = this.jwt.sign(
            { tipo: 'comms-link', idDestinatario: enlace.idDestinatario, idComunicado: enlace.idComunicado },
            { expiresIn: '15m', audience: 'comms-link', subject: String(enlace.idEnlace) },
        );
        return { token: acceso, expiraEn: new Date(ahora.getTime() + JWT_MS) };
    }

    async contenido(token: string, autorizacion?: string) {
        const enlace = await this.resolver(token);
        this.exigirLibre(enlace);
        if (enlace.requiereIdentidad) this.exigirAcceso(autorizacion, enlace.idEnlace);
        const adjuntos = await this.prisma.comComunicadoAdjuntos.findMany({
            where: { idVersion: enlace.version.idVersion },
            orderBy: { idAdjunto: 'asc' },
        });
        return {
            id: enlace.idComunicado,
            titulo: enlace.version.Titulo,
            resumen: enlace.version.Resumen,
            cuerpoHtml: enlace.version.CuerpoHtml,
            cuerpoTexto: aTextoPlano(enlace.version.CuerpoHtml),
            acuseModo: enlace.acuseModo,
            prioridad: enlace.prioridad,
            empresa: enlace.empresa,
            expiraEn: enlace.expiraEn,
            yaConfirmado: enlace.yaConfirmado,
            ...presentarPortada(this.storage, enlace.version.PortadaRuta, TTL_ARCHIVO),
            adjuntos: adjuntos.map((adjunto) => presentarAdjunto(this.storage, adjunto, TTL_ARCHIVO)),
        };
    }

    async acusar(token: string, contexto: ContextoEnlace) {
        const enlace = await this.resolver(token);
        this.exigirLibre(enlace);
        if (enlace.requiereIdentidad) this.exigirAcceso(contexto.autorizacion, enlace.idEnlace);
        return this.ack.confirmar({
            companyId: enlace.idEmpresa,
            idTenant: enlace.idTenant,
            idComunicado: enlace.idComunicado,
            idEmpleado: enlace.idEmpleado,
            canal: 'ENLACE',
            metodo: enlace.requiereIdentidad ? 'ENLACE_FECHA_NAC' : 'ENLACE',
            ip: contexto.ip,
            userAgent: contexto.userAgent,
            dispositivo: null,
            zonaHoraria: await this.zonaDe(enlace.idSite),
        });
    }

    private exigirLibre(enlace: { bloqueadoHasta: Date | null }): void {
        if (enlace.bloqueadoHasta && enlace.bloqueadoHasta.getTime() > this.ahora().getTime()) {
            throw errorComms(HttpStatus.LOCKED, 'ENLACE_BLOQUEADO', 'Este enlace está bloqueado. Inténtalo más tarde.', {
                bloqueadoHasta: enlace.bloqueadoHasta,
            });
        }
    }

    private exigirAcceso(autorizacion: string | undefined, idEnlace: number): void {
        const crudo = autorizacion?.replace(/^Bearer\s+/i, '').trim();
        if (!crudo) {
            throw errorComms(HttpStatus.UNAUTHORIZED, 'ENLACE_INVALIDO', 'Confirma tu fecha de nacimiento para continuar.');
        }
        try {
            const carga = this.jwt.verify<{ sub?: string }>(crudo, { audience: 'comms-link' });
            if (carga.sub !== String(idEnlace)) {
                throw errorComms(HttpStatus.UNAUTHORIZED, 'ENLACE_INVALIDO', 'Este acceso no corresponde al enlace.');
            }
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw errorComms(HttpStatus.UNAUTHORIZED, 'ENLACE_INVALIDO', 'El acceso expiró. Vuelve a confirmar tu identidad.');
        }
    }

    private async resolver(token: string) {
        const enlace = await this.prisma.comEnlacesSeguros.findUnique({
            where: { TokenHash: hashToken(token) },
            include: {
                ComDestinatarios: {
                    include: {
                        Empleados: { select: { idEmpleado: true, fechaNacimiento: true, idSite: true } },
                        ComComunicados: {
                            include: { CatEmpresas: { select: { nombre_comercial: true } } },
                        },
                    },
                },
            },
        });
        if (!enlace) throw errorComms(HttpStatus.NOT_FOUND, 'ENLACE_INVALIDO', 'El enlace no es válido.');
        const ahora = this.ahora();
        if (enlace.ExpiraEn.getTime() <= ahora.getTime()) {
            throw errorComms(HttpStatus.GONE, 'ENLACE_EXPIRADO', 'Este enlace ya venció.');
        }
        const dest = enlace.ComDestinatarios;
        const comunicado = dest.ComComunicados;
        const version = await this.prisma.comComunicadoVersiones.findUnique({
            where: { idComunicado_NumVersion: { idComunicado: comunicado.idComunicado, NumVersion: comunicado.VersionActual } },
        });
        if (!version) throw errorComms(HttpStatus.GONE, 'ENLACE_EXPIRADO', 'Este enlace ya venció.');
        return {
            idEnlace: enlace.idEnlace,
            idDestinatario: dest.idDestinatario,
            idComunicado: comunicado.idComunicado,
            idEmpresa: comunicado.idEmpresa,
            idTenant: comunicado.idTenant,
            idEmpleado: dest.idEmpleado,
            idSite: dest.Empleados.idSite,
            fechaNacimiento: dest.Empleados.fechaNacimiento,
            requiereIdentidad: comunicado.RequiereIdentidad,
            acuseModo: comunicado.AcuseModo,
            prioridad: comunicado.Prioridad,
            empresa: comunicado.CatEmpresas.nombre_comercial,
            expiraEn: enlace.ExpiraEn,
            intentos: enlace.Intentos,
            bloqueadoHasta: enlace.BloqueadoHasta,
            yaConfirmado: dest.Estado === 'CONFIRMADO' && dest.VersionConfirmada === comunicado.VersionActual,
            estado: comunicado.Estado,
            vigenteHasta: comunicado.VigenteHasta,
            version,
        };
    }

    private async zonaDe(idSite: number | null): Promise<string> {
        if (!idSite) return ZONA_DEFAULT;
        const site = await this.prisma.catSites.findUnique({ where: { idSite }, select: { zonaHoraria: true } });
        return site?.zonaHoraria || ZONA_DEFAULT;
    }
}
