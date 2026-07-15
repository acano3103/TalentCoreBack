import { Controller, Get, Post, Body, Param, Res } from '@nestjs/common';
import { DocumentosTemplatesService } from './documentos-templates.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

@ApiTags('Documentos - Firma Pública')
@Controller('documentos/public')
export class DocumentosPublicController {
    constructor(private readonly service: DocumentosTemplatesService) { }

    @Get('firmar/:token')
    @ApiOperation({ summary: 'Get document for public signature' })
    @ApiResponse({ status: 200, description: 'Document info with signature fields' })
    async getForSignature(@Param('token') token: string) {
        return this.service.getForPublicSignature(token);
    }

    @Get('firmar/:token/pdf')
    @ApiOperation({ summary: 'Serve PDF for public signature preview' })
    @ApiResponse({ status: 200, description: 'PDF file streamed' })
    async servePdf(@Param('token') token: string, @Res() res: Response) {
        return this.service.serveSignaturePdf(token, res);
    }

    @Post('firmar/:token')
    @ApiOperation({ summary: 'Save signature for document' })
    @ApiResponse({ status: 200, description: 'Signature saved and embedded in PDF' })
    async saveSignature(
        @Param('token') token: string,
        @Body() body: { imagen: string; camposFirmados?: Record<string, string> },
    ) {
        return this.service.savePublicSignature(token, body);
    }
}
