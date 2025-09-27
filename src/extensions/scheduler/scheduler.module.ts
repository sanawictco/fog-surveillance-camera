import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [QueueModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
