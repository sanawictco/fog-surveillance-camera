import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemLogService } from '../applicationService/services/systemLog.service';
import { GetAllSystemLogsRequestDto } from '../contracts/systemLog/getAllSystemLogs.request.dto';

@ApiTags('/system-logs')
@Controller('/system-logs')
export class SystemLogController {
  constructor(private readonly systemLogService: SystemLogService) {}

  @Get('/')
  findAll(@Query() query: GetAllSystemLogsRequestDto) {
    return this.systemLogService.findAll(query);
  }

  @Get('/dictionary')
  getDictionary() {
    return this.systemLogService.getDictionary();
  }
}
