import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SesionKiosco } from 'src/modules/kiosks/kiosk-auth/kiosco-actual';
import { presentarAdjunto, presentarPortada } from '../announcements/archivo-publico';
import { CommsStorageService } from '../announcements/comms-storage.service';
import { aTextoPlano } from '../announcements/sanitize-cuerpo';
import { normalizarCanales } from '../channels/canales';
import { errorComms } from '../comms-http';
import { CommsAckService } from '../me/comms-ack.service';
import { AcuseKioscoDto } from './dto/acuse-kiosco.dto';
import { metodoDeChecada, visibleEnKiosco } from './metodo-kiosco';

const VENTANA_MS = 5 * 60 * 1000;
const ZONA_DEFAULT = 'America/Mexico_City';
const MAX_AVISOS = 3;
const TTL_ARCHIVO = 60 * 60;
const MENSAJE_CHECADA = 'Para confirmar, necesitas haber checado en este kiosco en los últimos 5 minutos.';

@Injectable()
export class KioskCommsService {
    ahora: () => Date = () => new Date();

    constructor(
        private readonly prisma: PrismaService,
        private readonly ack: CommsAckService,
        private readonly storage: CommsStorageService,
    ) {}

    async pendientes(kiosco: SesionKiosco, idEmpleado: number) {
        const empleado = await this.empleadoDe(kiosco, idEmpleado);
        if (!empleado) return [];
        const ahora = this.ahora();
        const filas = await this.prisma.comDestinatarios.findMany({
            where: {
                idEmpleado,
                ComComunicados: {
                    idEmpresa: kiosco.idEmpresa,
                    idTenant: kiosco.idTenant,
                    Estado: 'ENVIADO',
                    OR: [{ VigenteHasta: null }, { VigenteHasta: { gt: ahora } }],
                },
            },
            include: { ComComunicados: { include: { ComTiposComunicado: true } } },
        });
        const elegidas = filas
            .filter((fila) =>
                visibleEnKiosco({
                    canales: normalizarCanales(fila.CanalesEfectivos),
                    esCorto: fila.ComComunicados.ComTiposComunicado.EsCorto,
                    acuseModo: fila.ComComunicados.AcuseModo,
                    estadoDestinatario: fila.Estado,
                }),
            )
            .sort((a, b) => (b.ComComunicados.EnviadoEn?.getTime() ?? 0) - (a.ComComunicados.EnviadoEn?.getTime() ?? 0))
            .slice(0, MAX_AVISOS);
        if (!elegidas.length) return [];
        const versiones = await this.prisma.comComunicadoVersiones.findMany({
            where: {
                OR: elegidas.map((fila) => ({ idComunicado: fila.idComunicado, NumVersion: fila.ComComunicados.VersionActual })),
            },
        });
        const porClave = new Map(versiones.map((fila) => [`${fila.idComunicado}:${fila.NumVersion}`, fila]));
        const idsVersion = [...new Set(versiones.map((fila) => fila.idVersion).filter((id) => typeof id === 'number'))];
        const adjuntos = idsVersion.length
            ? await this.prisma.comComunicadoAdjuntos.findMany({
                  where: { idVersion: { in: idsVersion } },
                  orderBy: { idAdjunto: 'asc' },
              })
            : [];
        const adjuntosPorVersion = new Map<number, typeof adjuntos>();
        for (const adjunto of adjuntos) {
            const lista = adjuntosPorVersion.get(adjunto.idVersion) ?? [];
            lista.push(adjunto);
            adjuntosPorVersion.set(adjunto.idVersion, lista);
        }
        return elegidas.flatMap((fila) => {
            const version = porClave.get(`${fila.idComunicado}:${fila.ComComunicados.VersionActual}`);
            if (!version) return [];
            return [
                {
                    id: fila.idComunicado,
                    titulo: version.Titulo,
                    resumen: version.Resumen,
                    cuerpoTexto: aTextoPlano(version.CuerpoHtml),
                    esAviso: fila.ComComunicados.ComTiposComunicado.EsCorto,
                    acuseModo: fila.ComComunicados.AcuseModo,
                    prioridad: fila.ComComunicados.Prioridad,
                    requiereAcuse: fila.ComComunicados.AcuseModo !== 'NINGUNO' && fila.Estado !== 'CONFIRMADO',
                    enviadoEn: fila.ComComunicados.EnviadoEn,
                    ...presentarPortada(this.storage, version.PortadaRuta, TTL_ARCHIVO),
                    adjuntos: (adjuntosPorVersion.get(version.idVersion) ?? []).map((adjunto) =>
                        presentarAdjunto(this.storage, adjunto, TTL_ARCHIVO),
                    ),
                },
            ];
        });
    }

    async acusar(kiosco: SesionKiosco, idComunicado: number, dto: AcuseKioscoDto, ctx: { ip: string | null; userAgent: string | null }) {
        const empleado = await this.empleadoDe(kiosco, dto.idEmpleado);
        if (!empleado) {
            throw errorComms(HttpStatus.NOT_FOUND, 'EMPLEADO_NO_ENCONTRADO', 'No encontramos a ese empleado en esta empresa.');
        }
        const registro = await this.prisma.registrosAsistencia.findFirst({
            where: { idRegistro: BigInt(dto.idRegistroAsistencia) },
            select: {
                idEmpleado: true,
                idKiosco: true,
                idEmpresa: true,
                idTenant: true,
                fechaHoraRegistro: true,
                metodoIdentificacion: true,
                zonaHoraria: true,
            },
        });
        const edad = registro ? this.ahora().getTime() - registro.fechaHoraRegistro.getTime() : Number.POSITIVE_INFINITY;
        const checadaValida =
            registro &&
            registro.idEmpleado === empleado.idEmpleado &&
            registro.idKiosco === kiosco.idKiosco &&
            registro.idEmpresa === kiosco.idEmpresa &&
            registro.idTenant === kiosco.idTenant &&
            edad >= -30_000 &&
            edad <= VENTANA_MS;
        if (!registro || !checadaValida) {
            throw errorComms(HttpStatus.CONFLICT, 'CHECADA_NO_RECIENTE', MENSAJE_CHECADA);
        }
        return this.ack.confirmar({
            companyId: kiosco.idEmpresa,
            idTenant: kiosco.idTenant,
            idComunicado,
            idEmpleado: empleado.idEmpleado,
            canal: 'KIOSCO',
            metodo: metodoDeChecada(registro.metodoIdentificacion),
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            dispositivo: kiosco.nombre.slice(0, 120),
            zonaHoraria: registro.zonaHoraria || ZONA_DEFAULT,
        });
    }

    private async empleadoDe(kiosco: SesionKiosco, idEmpleado: number) {
        return this.prisma.empleados.findFirst({
            where: { idEmpleado, idEmpresa: kiosco.idEmpresa, idTenant: kiosco.idTenant, activo: true },
            select: { idEmpleado: true },
        });
    }
}
