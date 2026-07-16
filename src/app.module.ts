import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { PositionsModule } from './modules/positions/positions.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { UsersModule } from './modules/users/users.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { MediaModule } from './media/media.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { PostulationsModule } from './modules/postulations/postulations.module';
import { LocationsModule } from './modules/locations/locations.module';
import { AreasService } from './modules/areas/areas.service';
import { AreasModule } from './modules/areas/areas.module';
import { CostCenterModule } from './modules/cost-center/cost-center.module';
import { EventsModule } from './modules/events/events.module';
import { OrganizationChartModule } from './modules/positions/organization-chart/organization-chart.module';
import { HeadcountModule } from './modules/headcount/headcount.module';
import { RolesModule } from './modules/roles/roles.module';
import { VacanciesController } from './modules/vacancies/vacancies.controller';
import { VacanciesModule } from './modules/vacancies/vacancies.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { DigitalFilesModule } from './modules/digital-files/digital-files.module';
import { DocumentosTemplatesModule } from './modules/documentos-templates/documentos-templates.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { EmployeesModule } from './modules/employees/employees.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
   ServeStaticModule.forRoot(
  {
    rootPath: join(process.cwd(), 'public'),
    serveRoot: '/public',
  },
  {
    rootPath: join(process.cwd(), 'media'),
    serveRoot: '/media',
  }
),
    PrismaModule,
    AuthModule,
    PositionsModule,
    OrganizationChartModule,
    UsersModule,
    IntegrationsModule,
    InterviewsModule,
    PostulationsModule,
    CatalogsModule,
    MediaModule,
    CompaniesModule,
    LocationsModule,
    AreasModule,
    CostCenterModule,
    EventsModule,
    HeadcountModule,
    RolesModule,
    VacanciesModule,
    ActivityLogsModule,
    DigitalFilesModule,
    DocumentosTemplatesModule,
    ContractsModule,
    EmployeesModule
  ],
  controllers: [],
  providers: [AreasService],
})
export class AppModule { }

