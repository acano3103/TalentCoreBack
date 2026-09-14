import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { ToggleLegalWorkDayDto } from './dto/toggle-legal-work-day.dto';

@Injectable()
export class LegalWorkdayService {
    constructor(private readonly prisma: PrismaService) { }

    async getStatus(user: ActiveUserDto, companyId: number) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        const config = await this.prisma.configuracionJornadaLegal.findMany({
            where: {
                idEmpresa: companyId,
                idTenant: user.idTenant,
            },
            orderBy: {
                anio: 'asc',
            },
        });

        const isEnabled = config.length > 0 && config.some((c: any) => Boolean(c.activo));

        return {
            isEnabled,
            config: config.map((c: any) => ({
                ...c,
                horasSemana: Number(c.horasSemana),
                horasDia: Number(c.horasDia),
                extraSemanalMax: Number(c.extraSemanalMax),
                extraDiarioMax: Number(c.extraDiarioMax),
                factorDentro: Number(c.factorDentro),
                factorFuera: Number(c.factorFuera),
                primaDominical: Number(c.primaDominical),
            })),
        };
    }

    async toggleReform(user: ActiveUserDto, companyId: number, dto: ToggleLegalWorkDayDto) {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }

        // Desactivación
        if (!dto.enable) {
            await this.prisma.configuracionJornadaLegal.updateMany({
                where: {
                    idEmpresa: companyId,
                    idTenant: user.idTenant,
                },
                data: {
                    activo: false,
                },
            });

            return { isEnabled: false, message: 'Reforma desactivada correctamente' };
        }

        // Activación: Definición oficial del calendario (2026 - 2030)
        const defaultYears = [
            { anio: 2026, horas: 48, extraSemanal: 9, extraDiario: 3, diasExtra: 3 },
            { anio: 2027, horas: 46, extraSemanal: 9, extraDiario: 3, diasExtra: 3 },
            { anio: 2028, horas: 44, extraSemanal: 10, extraDiario: 4, diasExtra: 4 },
            { anio: 2029, horas: 42, extraSemanal: 11, extraDiario: 4, diasExtra: 4 },
            { anio: 2030, horas: 40, extraSemanal: 12, extraDiario: 4, diasExtra: 4 },
        ];

        // Transacción nativa usando upsert para respetar la clave única compuesta (idEmpresa, anio)
        await this.prisma.$transaction(
            defaultYears.map((y) =>
                this.prisma.configuracionJornadaLegal.upsert({
                    where: {
                        idEmpresa_anio: {
                            idEmpresa: companyId,
                            anio: y.anio,
                        },
                    },
                    update: {
                        activo: true,
                        horasSemana: y.horas,
                        horasDia: 8.0,
                        extraSemanalMax: y.extraSemanal,
                        extraDiarioMax: y.extraDiario,
                        diasConExtraMax: y.diasExtra,
                        factorDentro: 2.0,
                        factorFuera: 3.0,
                        primaDominical: 0.25,
                    },
                    create: {
                        idTenant: user.idTenant,
                        idEmpresa: companyId,
                        codigoPais: 'MEX',
                        anio: y.anio,
                        horasSemana: y.horas,
                        horasDia: 8.0,
                        extraSemanalMax: y.extraSemanal,
                        extraDiarioMax: y.extraDiario,
                        diasConExtraMax: y.diasExtra,
                        factorDentro: 2.0,
                        factorFuera: 3.0,
                        primaDominical: 0.25,
                        activo: true,
                    },
                })
            )
        );

        return { isEnabled: true, message: 'Reforma activada con valores oficiales' };
    }
}