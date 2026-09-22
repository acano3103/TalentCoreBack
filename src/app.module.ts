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
import { VacanciesModule } from './modules/vacancies/vacancies.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { DigitalFilesModule } from './modules/digital-files/digital-files.module';
import { DocumentosTemplatesModule } from './modules/documentos-templates/documentos-templates.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { InternalMovementsModule } from './modules/internal-movements/internal-movements.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CoursesModule } from './modules/courses/courses.module';
import { RoleplaysModule } from './modules/roleplays/roleplays.module';
import { CareerPlanModule } from './modules/career-plan/career-plan.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { GeofencesService } from './modules/geofences/geofences.service';
import { GeofencesModule } from './modules/geofences/geofences.module';
import { MobileModule } from './modules/mobile/mobile.module';
import { WorkShiftsModule } from './modules/work-shifts/work-shifts.module';
import { LegalWorkdayModule } from './modules/legal-workday/legal-workday.module';
import { LogbookModule } from './modules/logbook/logbook.module';
import { AttendanceDashboardModule } from './modules/dashboards/attendance-dashboard/attendance-dashboard.module';
import { AttendanceTrackingConfigModule } from './modules/config/attendance-config/attendance-config.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { existsSync } from 'fs';

// Determina dinámicamente la ruta correcta de public
const publicDistPath = join(process.cwd(), 'dist', 'public');
const publicSrcPath = join(process.cwd(), 'src', 'public');
const staticPublicPath = existsSync(publicDistPath) ? publicDistPath : publicSrcPath;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot(
      {
        rootPath: staticPublicPath,
        serveRoot: '/public',
        exclude: ['/api/(.*)'],
        serveStaticOptions: {
          index: false,
          fallthrough: false, // Evita buscar index.html cuando no existe el archivo
          cacheControl: true,
          maxAge: '7d',
        },
      },
      {
        rootPath: process.env.MEDIA_ROOT_PATH || join(process.cwd(), 'media'),
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
    EmployeesModule,
    InternalMovementsModule,
    CoursesModule,
    RoleplaysModule,
    CareerPlanModule,
    ConfigurationModule,
    SuperAdminModule,
    GeofencesModule,
    MobileModule,
    WorkShiftsModule,
    LegalWorkdayModule,
    LogbookModule,
    AttendanceDashboardModule,
    AttendanceTrackingConfigModule,
    AttendanceModule
  ],
  controllers: [],
  providers: [AreasService, GeofencesService],
})
export class AppModule { }