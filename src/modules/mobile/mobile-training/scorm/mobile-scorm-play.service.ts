import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CourseLearningService } from 'src/modules/courses/learning/course-learning.service';
import { CourseScormService, ScormPlayClaims } from 'src/modules/courses/scorm/course-scorm.service';
import { EstadoLauncher, renderLauncher } from './launcher.template';

const AUDIENCIA = 'scorm-play';
const VIGENCIA = '4h' as const;

@Injectable()
export class MobileScormPlayService {
    constructor(
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
        private readonly scorm: CourseScormService,
        private readonly learning: CourseLearningService,
    ) {}

    async crear(companyId: number, sessionId: number, user: ActiveUserDto) {
        const launch = await this.scorm.getLaunch(companyId, sessionId, user);
        const { participacion, idEmpleado, idTenant } = await this.learning.getParticipation(companyId, sessionId, user);
        const claims: ScormPlayClaims = {
            idParticipante: participacion.idParticipante,
            idSesion: sessionId,
            idEmpresa: companyId,
            idTenant,
            idEmpleado,
        };
        const token = this.jwt.sign(claims, { secret: this.secreto(), audience: AUDIENCIA, expiresIn: VIGENCIA });
        const decoded = this.jwt.decode(token) as { exp?: number } | null;
        return {
            urlLanzador: `mobile/scorm-play/${token}/index.html`,
            expiraEn: new Date((decoded?.exp ?? 0) * 1000).toISOString(),
            version: launch.version,
            titulo: launch.titulo,
            disponible: launch.disponible,
            motivoNoDisponible: launch.motivoNoDisponible,
            estado: {
                entrada: launch.estado.entrada,
                tiempoTotal: launch.estado.tiempoTotal,
                totalIntentos: launch.estado.totalIntentos,
            },
        };
    }

    async html(token: string): Promise<string> {
        const claims = this.verificar(token);
        const launch = await this.scorm.openForPlay(claims);
        const estado: EstadoLauncher = {
            version: launch.version,
            titulo: launch.titulo,
            disponible: launch.disponible,
            entrada: launch.estado.entrada,
            tiempoTotal: launch.estado.tiempoTotal,
            alumno: launch.alumno,
            valores: launch.estado.valores,
            archivoInicio: launch.archivoInicio,
        };
        return renderLauncher(estado);
    }

    async archivo(token: string, filePath: string, res: Response) {
        const claims = this.verificar(token);
        await this.scorm.assertPlayAccess(claims);
        await this.scorm.sendSessionFile(claims.idEmpresa, claims.idSesion, claims.idTenant, filePath, res, 'private, max-age=3600');
    }

    private verificar(token: string): ScormPlayClaims {
        try {
            const payload = this.jwt.verify(token, { secret: this.secreto(), audience: AUDIENCIA }) as Record<string, unknown>;
            const claims = {
                idParticipante: Number(payload.idParticipante),
                idSesion: Number(payload.idSesion),
                idEmpresa: Number(payload.idEmpresa),
                idTenant: Number(payload.idTenant),
                idEmpleado: Number(payload.idEmpleado),
            };
            if (!Object.values(claims).every((n) => Number.isInteger(n) && n > 0)) throw new Error('claims');
            return claims;
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error;
            throw new UnauthorizedException('La sesión del curso expiró. Vuelve a abrirlo desde la app.');
        }
    }

    private secreto() {
        const dedicado = this.config.get<string>('SCORM_PLAY_SECRET');
        if (dedicado) return dedicado;
        const base = this.config.get<string>('JWT_SECRET');
        if (!base) throw new UnauthorizedException('La sesión del curso expiró. Vuelve a abrirlo desde la app.');
        return base;
    }
}
