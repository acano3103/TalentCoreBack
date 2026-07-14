import { Module } from '@nestjs/common';
import { DocumentosTemplatesService } from './documentos-templates.service';
import { DocumentosTemplatesController } from './documentos-templates.controller';

@Module({
  providers: [DocumentosTemplatesService],
  controllers: [DocumentosTemplatesController],
  exports: [DocumentosTemplatesService]
})
export class DocumentosTemplatesModule { }
