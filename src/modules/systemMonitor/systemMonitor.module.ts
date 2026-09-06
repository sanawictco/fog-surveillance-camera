import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SystemMonitorService } from './systemMonitor.service';
import { SystemMonitorController } from './systemMonitor.controller';
import { TDengineModule } from 'src/extensions/tdengine/tdengine.module';

@Module({
  imports: [CqrsModule, TDengineModule],
  providers: [SystemMonitorService],
  controllers: [SystemMonitorController],
})
export class SystemMonitorModule {}
