import { Module } from '@nestjs/common';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { PositionTagsController } from './position-tags.controller';
import { PositionTagsService } from './position-tags.service';
import { StaffClassificationController } from './staff-classification.controller';
import { StaffClassificationService } from './staff-classification.service';
import { StaffTypeResolver } from './staff-type.resolver';

@Module({
    imports: [CapabilitiesModule],
    controllers: [StaffClassificationController, PositionTagsController],
    providers: [StaffClassificationService, PositionTagsService, StaffTypeResolver],
    exports: [StaffTypeResolver],
})
export class StaffClassificationModule {}
