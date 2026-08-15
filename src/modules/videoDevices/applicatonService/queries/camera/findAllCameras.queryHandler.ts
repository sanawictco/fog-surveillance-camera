import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { QueryBase } from 'src/dddLib/applicationService';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';
import { LiveSignalStatuses } from 'src/modules/videoDevices/shared/valueObjects/liveSignalStatus.vo';
import { CameraEntity } from '../../../domain/camera/camera.entity';

interface CameraQueryFilter {
  name: string | RegExp;
  isActive: boolean;
  nvrId: string;
  liveSignalStatus: LiveSignalStatuses;
}

export class FindAllCamerasQuery extends QueryBase<CameraQueryFilter> {}
@QueryHandler(FindAllCamerasQuery)
export class FindAllCamerasQueryHandler implements IQueryHandler<FindAllCamerasQuery> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    protected readonly cameraRepo: CameraRepository,
  ) {}

  async execute(query: FindAllCamerasQuery): Promise<CameraEntity[]> {
    const records = await this.cameraRepo.findAll(query);
    return records;
  }
}
