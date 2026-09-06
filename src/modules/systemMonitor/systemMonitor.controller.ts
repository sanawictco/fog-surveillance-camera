import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemMonitorService } from './systemMonitor.service';

@ApiTags('/system-monitor')
@Controller('/system-monitor')
export class SystemMonitorController {
  constructor(private readonly systemMonitorService: SystemMonitorService) {}

  @Get('/health')
  async getHealthStatus() {
    return this.systemMonitorService.getHealthStatus();
  }
}
