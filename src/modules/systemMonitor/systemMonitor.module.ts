import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SystemMonitorService } from './systemMonitor.service';
import { SystemMonitorController } from './systemMonitor.controller';

@Module({
  imports: [CqrsModule],
  providers: [SystemMonitorService],
  controllers: [SystemMonitorController],
})
export class SystemMonitorModule {}
