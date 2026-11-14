import { SetMetadata } from '@nestjs/common';
import { CodigoCapacidad } from './alcance';

export const CAPABILITY_KEY = 'commsCapability';

export const RequireCapability = (codigo: CodigoCapacidad) => SetMetadata(CAPABILITY_KEY, codigo);
