import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { QueryBase } from 'src/dddLib/applicationService';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';

interface CameraQueryFilter {
  deletedCamerasSerialNumbers: string[];
}
export class FindAllDeletedCamerasByDeletedSerialNumbersQuery extends QueryBase<CameraQueryFilter> {}
@QueryHandler(FindAllDeletedCamerasByDeletedSerialNumbersQuery)
export class FindAllDeletedCamerasByDeletedSerialNumbersQueryHandler implements IQueryHandler<FindAllDeletedCamerasByDeletedSerialNumbersQuery> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    protected readonly cameraRepo: CameraRepository,
  ) {}

  async execute(query: FindAllDeletedCamerasByDeletedSerialNumbersQuery) {
    const records = await this.cameraRepo.findAll({
      filter: {
        $and: [
          {
            serialNumber: {
              $in: query.filter?.deletedCamerasSerialNumbers,
            },
          },
        ],
      },
      orderBy: query.orderBy,
    });
    return records;
  }
}
