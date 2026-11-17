import { Module } from '@nestjs/common';
import { DocumentosTemplatesService } from './documentos-templates.service';
import { DocumentosTemplatesController } from './documentos-templates.controller';
import { DocumentosPublicController } from './documents-public/documentos-public.controller';
import { TiposDocumentoController } from './document-types/tipos-documento.controller';
import { DigitalFilesModule } from '../digital-files/digital-files.module';
import { MediaPathModule } from 'src/common/services/media-path.module';
import { DocumentPreviewService } from './document-preview/document-preview.service';
import { DocumentPreviewController } from './document-preview/document-preview.controller';

@Module({
  imports: [DigitalFilesModule, MediaPathModule],
  providers: [DocumentosTemplatesService, DocumentPreviewService],
  controllers: [
    DocumentosTemplatesController,
    DocumentosPublicController,
    TiposDocumentoController,
    DocumentPreviewController
  ],
  exports: [DocumentosTemplatesService]
})
export class DocumentosTemplatesModule { }
