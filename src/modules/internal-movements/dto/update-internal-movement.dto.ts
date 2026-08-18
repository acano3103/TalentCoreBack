import { PartialType } from '@nestjs/swagger';
import { CreateInternalMovementDto } from './create-internal-movement.dto';

export class UpdateInternalMovementDto extends PartialType(
  CreateInternalMovementDto,
) {}
