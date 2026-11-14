import { Module } from '@nestjs/common';
import { StaffClassificationModule } from './staff-classification/staff-classification.module';

@Module({
    imports: [StaffClassificationModule],
    exports: [StaffClassificationModule],
})
export class CommunicationsModule {}
