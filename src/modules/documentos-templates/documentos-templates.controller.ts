import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards, DefaultValuePipe, UseInterceptors, UploadedFile, Res, Patch } from '@nestjs/common';
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
@Controller('companies/:companyId/documents/templates')
export class DocumentosTemplatesController {
    constructor(private readonly service: DocumentosTemplatesService) { }

    // Creamos una platilla de documento
    @Post()
    @UseInterceptors(FileInterceptor('archivo'))
    @ApiOperation({ summary: 'Upload a document template', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Template created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid file or missing fields' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
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
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async findAll(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('status') status: string,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('idTipoDocumento') idTipoDocumento?: string,
    ) {
        return this.service.findAll(companyId, page, status, limit, search || '', idTipoDocumento ? Number(idTipoDocumento) : undefined);
    }

    @Get('catalog-fields')
    @ApiOperation({ summary: 'List of catalogs fiels', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Catalogs fields obtained successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async findCatalogsFiels(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.service.findCatalogsFiels(companyId);
    }

    @Get('generated')
    @ApiOperation({ summary: 'List generated documents', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Generated documents listed' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async findGenerated(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
    ) {
        return this.service.findGenerated(companyId, page, limit, search);
    }

    @Get('by-type/:idTipoDocumento')
    @ApiOperation({ summary: 'List active templates by document type', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Templates listed successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async findByType(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('idTipoDocumento', ParseIntPipe) idTipoDocumento: number,
    ) {
        return this.service.findByType(companyId, idTipoDocumento);
    }

    @Get('generated/:id/pdf')
    @ApiOperation({ summary: 'Serve generated PDF file', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'PDF file streamed' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async servePdf(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Res() res: Response,
    ) {
        return this.service.servePdf(companyId, id, res);
    }

    @Get('generated/:id/download')
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

    @Get(':id/generation-data/:employeeId')
    @ApiOperation({ summary: 'Obtener datos para generar una plantilla' })
    async getGenerationData(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('employeeId', ParseIntPipe) employeeId: number,
    ) {
        return this.service.getGenerationData(activeUser, companyId, id, employeeId);
    }

    @Get('generated/:id')
    @ApiOperation({ summary: 'Get generated document detail', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Generated document detail' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async findOneGenerated(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.findOneGenerated(companyId, id);
    }

    @Put('generated/:id')
    @ApiOperation({ summary: 'Update generated document', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Generated document updated' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
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
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
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

    // Obtenemos una platilla de documento especifica
    @Get(':id')
    @ApiOperation({ summary: 'Get template detail', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Template found' })
    @ApiResponse({ status: 404, description: 'Template not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
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
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
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
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async remove(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.remove(companyId, id);
    }

    // Creamos los campos reemplazables de una plantilla de documento
    @Put(':id/fields')
    @ApiOperation({ summary: 'Save/replace all fields for a template', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Fields saved' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async saveCampos(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() updateCamposDto: UpdateCamposDto,
    ) {
        return this.service.saveCampos(companyId, id, updateCamposDto);
    }

    // Generamos un documento a partir de una plantilla
    @Post(':id/generate/:employeeId')
    @ApiOperation({ summary: 'Generate document from template', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Document generated' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async generate(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('employeeId', ParseIntPipe) employeeId: number,
        @Body() generateDto: GenerarDocumentoDto,
    ) {
        return this.service.generate(companyId, id, employeeId, generateDto, activeUser);
    }

    @Post('generated/:id/share')
    @ApiOperation({ summary: 'Generate sharing link for signature', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Share link generated' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async shareForSignature(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.shareForSignature(companyId, id);
    }

    @Post('generated/:id/sellar')
    @ApiOperation({ summary: 'Retry NOM-151 sealing for a signed document', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Document sealed' })
    @ApiResponse({ status: 400, description: 'Document not signed or already sealed' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async sellarManual(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.sellarManual(companyId, id);
    }

    @Get('generated/:id/nom151')
    @ApiOperation({ summary: 'Download NOM-151 constancia (.cer, or visual PDF with ?tipo=pdf)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Constancia file downloaded' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
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

    @Patch(':id/reactivate')
    @ApiOperation({ summary: 'Reactivate template', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Template reactivated' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'Template not found' })
    async reactivate(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.reactivate(companyId, id);
    }
}
