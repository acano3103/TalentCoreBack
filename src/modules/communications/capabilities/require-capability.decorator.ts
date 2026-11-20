import { SetMetadata } from '@nestjs/common';
import { CodigoCapacidad } from './alcance';

export const CAPABILITY_KEY = 'commsCapability';

/** Una capacidad, o varias: basta con tener cualquiera de ellas. */
export const RequireCapability = (...codigos: CodigoCapacidad[]) => SetMetadata(CAPABILITY_KEY, codigos);
