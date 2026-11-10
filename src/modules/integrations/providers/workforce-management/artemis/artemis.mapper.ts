import { Injectable } from '@nestjs/common';
import { CanonicalPosition } from "../interfaces/workforce-management.interface";

@Injectable()
export class ArtemisMapper {
    // Convierte un solo objeto de Prisma a CanonicalPosition
    toCanonicalPosition(puesto: any): CanonicalPosition {
        return {
            id: String(puesto.idPuesto),
            name: puesto.NombrePuesto,
            description: puesto.DescripcionPuesto ?? '',
            status: puesto.Activo ? 'ACTIVE' : 'INACTIVE',
        };
    }

    // Convierte una lista/arreglo de objetos
    toCanonicalPositions(puestos: any[]): CanonicalPosition[] {
        return puestos.map((puesto) => this.toCanonicalPosition(puesto));
    }
}