import { Module } from '@nestjs/common';
import { CachingModule } from '../caching/cacheing.module';
import { QueueService } from './queue.service';

@Module({
  imports: [CachingModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
