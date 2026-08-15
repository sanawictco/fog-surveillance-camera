import { BadRequestException, Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { FindNvrByIdQuery } from '../../../queries/nvr/findNvrById.queryHandler';

@Injectable()
export class NvrValidator {
  constructor(private readonly serviceProvider: ServiceProvider) {}
  async checkExistsNvrWithId(id: string): Promise<NvrEntity> {
    const nvrEntity: NvrEntity = await this.serviceProvider.queryBus.execute(
      new FindNvrByIdQuery(id),
    );
    if (!nvrEntity) throw new BadRequestException('the nvr not exist');
    return nvrEntity;
  }
}
