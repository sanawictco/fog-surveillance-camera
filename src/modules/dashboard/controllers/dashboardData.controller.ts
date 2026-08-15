import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DashboardDataService } from '../applicationService/services/dashboardData.service';
import { SendDataRequestDto } from '../applicationService/contracts/sendData.request.dto';

@ApiTags('/dashboard/data')
@Controller('/dashboard/data')
export class DashboardDataController {
  constructor(private readonly dashboardDataService: DashboardDataService) {}

  @Post('/send-move-data')
  @HttpCode(HttpStatus.ACCEPTED)
  sendMoveData(@Body() body: SendDataRequestDto): Promise<string> {
    return this.dashboardDataService.sendMoveData(body);
  }

  @Post('/send-zoom-data')
  @HttpCode(HttpStatus.ACCEPTED)
  sendZoomData(@Body() body: SendDataRequestDto): Promise<string> {
    return this.dashboardDataService.sendZoomData(body);
  }
}
