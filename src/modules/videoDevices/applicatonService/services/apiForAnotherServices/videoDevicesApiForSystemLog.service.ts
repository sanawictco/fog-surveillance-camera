import { Injectable } from '@nestjs/common/decorators';
import AppConfig from 'configs/app.config';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { NvrEntity } from '../../../domain/nvr/nvr.entity';
import { FindNvrByIdQuery } from '../../queries/nvr/findNvrById.queryHandler';
import { NvrProps } from 'src/modules/videoDevices/domain/nvr/nvr.type';

@Injectable()
export class VideoDevicesApiForSystemLogService {
  constructor(private readonly serviceProvider: ServiceProvider) {}

  async getNvrProps(): Promise<NvrProps> {
    const nvrId = AppConfig().nvrId;
    const nvrEntity: NvrEntity = await this.serviceProvider.queryBus.execute(
      new FindNvrByIdQuery(nvrId),
    );
    return nvrEntity.getProps();
  }
}
