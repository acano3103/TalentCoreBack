import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { MediaPathModule } from 'src/common/services/media-path.module';

@Module({
  imports: [MediaPathModule],
  controllers: [CompaniesController],
  providers: [CompaniesService]
})
export class CompaniesModule { }
