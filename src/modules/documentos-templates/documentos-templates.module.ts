import { Module } from '@nestjs/common';
import { DocumentosTemplatesService } from './documentos-templates.service';
import { DocumentosTemplatesController } from './documentos-templates.controller';
import { DocumentosPublicController } from './documentos-public.controller';

@Module({
  providers: [DocumentosTemplatesService],
  controllers: [DocumentosTemplatesController, DocumentosPublicController],
  exports: [DocumentosTemplatesService]
})
export class DocumentosTemplatesModule { }
