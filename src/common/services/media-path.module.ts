import { Module } from '@nestjs/common';
import { MediaPathService } from './media-path.service';

@Module({
    providers: [MediaPathService],
    exports: [MediaPathService],
})
export class MediaPathModule { }