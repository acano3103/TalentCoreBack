import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { ArtemisMapper } from "./artemis.mapper";
import { CanonicalPosition } from "../interfaces/workforce-management.interface";

@Injectable()
export class ArtemisService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly artemisMapper: ArtemisMapper,
    ) { }

    async getPositions(): Promise<CanonicalPosition[]> {
        const puestos = await this.prisma.catPuestos.findMany({
            select: {
                idPuesto: true,
                NombrePuesto: true,
                DescripcionPuesto: true,
                Activo: true
            },
            orderBy: { idPuesto: 'asc' },
        });

        return this.artemisMapper.toCanonicalPositions(puestos);
    }
}