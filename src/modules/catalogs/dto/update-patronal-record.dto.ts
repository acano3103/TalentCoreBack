import { PartialType } from '@nestjs/swagger';
import { CreatePatronalRecordDto } from './create-patronal-record.dto';

export class UpdatePatronalRecordDto extends PartialType(CreatePatronalRecordDto) { }