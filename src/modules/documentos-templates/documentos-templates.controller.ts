import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards, DefaultValuePipe, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { DocumentosTemplatesService } from './documentos-templates.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreatePlantillaDto } from './dto/create-plantilla.dto';
import { UpdateCamposDto } from './dto/update-campos.dto';
import { GenerarDocumentoDto } from './dto/generar-documento.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';

@ApiTags('Documentos Templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/documentos/plantillas')
export class DocumentosTemplatesController {
    constructor(private readonly service: DocumentosTemplatesService) { }

    @Post()
    @UseInterceptors(FileInterceptor('archivo'))
    @ApiOperation({ summary: 'Upload a document template', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Template created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid file or missing fields' })
    async create(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createPlantillaDto: CreatePlantillaDto,
        @UploadedFile() archivo: Express.Multer.File,
    ) {
        return this.service.create(companyId, createPlantillaDto, archivo, activeUser);
    }

    @Get()
    @ApiOperation({ summary: 'List document templates', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Templates listed successfully' })
    async findAll(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('idTipoDocumento') idTipoDocumento?: string,
    ) {
        return this.service.findAll(companyId, page, limit, search || '', idTipoDocumento ? Number(idTipoDocumento) : undefined);
    }

    @Get('generados')
    @ApiOperation({ summary: 'List generated documents', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Generated documents listed' })
    async findGenerated(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    ) {
        return this.service.findGenerated(companyId, page, limit);
    }

    @Get('generados/:id/pdf')
    @ApiOperation({ summary: 'Serve generated PDF file', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'PDF file streamed' })
    async servePdf(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Res() res: Response,
    ) {
        const result = await this.service.servePdf(companyId, id);
        if (result.type === 'pdf') {
            const filename = path.basename(result.path);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
            res.sendFile(result.path);
        } else {
            const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; line-height: 1.7; color: #1a1a1a; font-size: 14px; }
    p { margin-bottom: 0.8rem; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
    td, th { border: 1px solid #ccc; padding: 6px 10px; }
    img { max-width: 100%; }
  </style>
</head>
<body>${result.content}</body>
</html>`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(fullHtml);
        }
    }

    @Get('generados/:id/download')
    @ApiOperation({ summary: 'Download generated document as PDF', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'PDF downloaded' })
    async downloadGenerated(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Res() res: Response,
    ) {
        const result = await this.service.downloadGenerated(companyId, id);
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        if (result.buffer) {
            res.send(result.buffer);
        } else {
            res.sendFile(result.path!);
        }
    }

    @Get('generados/:id')
    @ApiOperation({ summary: 'Get generated document detail', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Generated document detail' })
    async findOneGenerated(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.findOneGenerated(companyId, id);
    }

    @Put('generados/:id')
    @ApiOperation({ summary: 'Update generated document', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Generated document updated' })
    async updateGenerated(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() generateDto: GenerarDocumentoDto,
    ) {
        return this.service.updateGenerated(companyId, id, generateDto, activeUser);
    }

    @Get(':id/pdf')
    @ApiOperation({ summary: 'Serve original file as PDF or HTML preview', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'File streamed (PDF or HTML for DOCX)' })
    async serveOriginal(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Res() res: Response,
    ) {
        const result = await this.service.serveOriginalPdf(companyId, id);
        if (result.type === 'pdf') {
            const filename = path.basename(result.path);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
            res.sendFile(result.path);
        } else {
            const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; line-height: 1.7; color: #1a1a1a; font-size: 14px; cursor: text; }
    p { margin-bottom: 0.8rem; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
    td, th { border: 1px solid #ccc; padding: 6px 10px; }
    img { max-width: 100%; }
    ::selection { background: #3b82f6; color: #fff; }
  </style>
</head>
<body>${result.content}
<script>
  let lastText = '';
  document.addEventListener('mouseup', function () {
    setTimeout(function () {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text && text !== lastText) {
        lastText = text;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        window.parent.postMessage({
          type: 'DOCX_TEXT_SELECTED',
          text: text,
          rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height, bottom: rect.bottom }
        }, '*');
      } else if (!text && lastText) {
        lastText = '';
        window.parent.postMessage({ type: 'DOCX_TEXT_DESELECTED' }, '*');
      }
    }, 0);
  });
<\/script>
</body>
</html>`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(fullHtml);
        }
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get template detail', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Template found' })
    @ApiResponse({ status: 404, description: 'Template not found' })
    async findOne(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.findOne(companyId, id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update template metadata', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Template updated' })
    async update(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() data: Partial<CreatePlantillaDto>,
    ) {
        return this.service.update(companyId, id, data);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete template (soft delete)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Template deactivated' })
    async remove(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.remove(companyId, id);
    }

    @Put(':id/campos')
    @ApiOperation({ summary: 'Save/replace all campos for a template', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Campos saved' })
    async saveCampos(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() updateCamposDto: UpdateCamposDto,
    ) {
        return this.service.saveCampos(companyId, id, updateCamposDto);
    }

    @Post(':id/generar')
    @ApiOperation({ summary: 'Generate document from template', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Document generated' })
    async generate(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() generateDto: GenerarDocumentoDto,
    ) {
        return this.service.generate(companyId, id, generateDto, activeUser);
    }

    @Post('generados/:id/compartir')
    @ApiOperation({ summary: 'Generate sharing link for signature', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Share link generated' })
    async shareForSignature(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.shareForSignature(companyId, id);
    }

    @Post('generados/:id/sellar')
    @ApiOperation({ summary: 'Retry NOM-151 sealing for a signed document', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Document sealed' })
    @ApiResponse({ status: 400, description: 'Document not signed or already sealed' })
    async sellarManual(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.sellarManual(companyId, id);
    }

    @Get('generados/:id/nom151')
    @ApiOperation({ summary: 'Download NOM-151 constancia (.cer, or visual PDF with ?tipo=pdf)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Constancia file downloaded' })
    async getNom151File(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Query('tipo') tipo: string,
        @Res() res: Response,
    ) {
        const result = await this.service.getNom151File(companyId, id, tipo === 'pdf' ? 'pdf' : 'cer');
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.sendFile(result.path);
    }
}
