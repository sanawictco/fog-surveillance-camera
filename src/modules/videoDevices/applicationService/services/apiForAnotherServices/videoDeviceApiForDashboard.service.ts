import { Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';

@Injectable()
export class VideoDevicesApiForDashboardService {
  constructor(_serviceProvider: ServiceProvider) {}

  async sendMoveData(_id: string, _data: number[]): Promise<string> {
    return '';
  }

  async sendZoomData(_id: string, _data: number[]): Promise<string> {
    return '';
  }
}
