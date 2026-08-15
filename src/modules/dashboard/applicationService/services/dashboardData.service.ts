import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { SendDataRequestDto } from '../contracts/sendData.request.dto';
import { VideoDevicesApiForDashboardService } from 'src/modules/videoDevices/applicatonService/services/apiForAnotherServices/videoDeviceApiForDashboard.service';

@Injectable()
export class DashboardDataService {
  constructor(
    @Inject(forwardRef(() => VideoDevicesApiForDashboardService))
    private readonly videoDevicesApiForDashboardService: VideoDevicesApiForDashboardService,
  ) {}

  async sendMoveData(body: SendDataRequestDto): Promise<string> {
    return await this.videoDevicesApiForDashboardService.sendMoveData(
      body.endDeviceId,
      body.data,
    );
  }

  async sendZoomData(body: SendDataRequestDto): Promise<string> {
    return await this.videoDevicesApiForDashboardService.sendZoomData(
      body.endDeviceId,
      body.data,
    );
  }
}
