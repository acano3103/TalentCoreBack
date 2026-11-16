
import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Put,
    Res,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { DocumentPreviewService } from './document-preview.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { SaveSignaturePositionDto } from '../dto/save-signature-position.dto';

@ApiTags('Document Preview')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/documents/templates')
export class DocumentPreviewController {
    constructor(
        private readonly previewService: DocumentPreviewService,
    ) { }

    @Get(':id/preview')
    @ApiOperation({ summary: 'Generate and serve document template PDF preview', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'PDF preview streamed successfully', content: { 'application/pdf': {} } })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'Template or original file not found.' })
    @ApiResponse({ status: 500, description: 'Could not generate PDF preview.' })
    async preview(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Res() res: Response,
    ) {
        return this.previewService.generateDocumentPreview(companyId, id, res)
    }

    @Put('generated/:id/signature-position')
    @ApiOperation({ summary: 'Save signature position for a generated document', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Signature position saved successfully' })
    @ApiResponse({ status: 400, description: 'Invalid position or document already signed' })
    @ApiResponse({ status: 404, description: 'Generated document not found' })
    async saveSignaturePosition(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: SaveSignaturePositionDto,
    ) {
        return this.previewService.saveSignaturePosition(companyId, id, dto);
    }

    @Get('generated/:id/signature-position')
    @ApiOperation({ summary: 'Get signature position for a generated document', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Signature position retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Generated document not found' })
    async getSignaturePosition(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.previewService.getSignaturePosition(companyId, id);
    }
}
