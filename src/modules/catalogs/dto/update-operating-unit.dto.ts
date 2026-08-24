// DTO para Actualización
import { PartialType } from '@nestjs/swagger';
import { CreateOperatingUnitDto } from './create-operating-unit.dto';

export class UpdateOperatingUnitDto extends PartialType(CreateOperatingUnitDto) { }