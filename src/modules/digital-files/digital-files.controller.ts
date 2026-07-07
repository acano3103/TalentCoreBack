import { Controller, Logger, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DigitalFilesService } from './digital-files.service';

@ApiTags('Digital Files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/digital-files')
export class DigitalFilesController {

    constructor(private readonly digitalFilesService: DigitalFilesService) { }
}
