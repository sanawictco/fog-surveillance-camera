import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { QueryBase } from 'src/dddLib/applicationService';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';

interface CameraQueryFilter {
  accessPointId: string;
  existingCameraMacAddresses: number[];
}
export class FindAllDeletedCamerasByExistingMacAddressesQuery extends QueryBase<CameraQueryFilter> {}
@QueryHandler(FindAllDeletedCamerasByExistingMacAddressesQuery)
export class FindAllDeletedCamerasByExistingMacAddressesQueryHandler implements IQueryHandler<FindAllDeletedCamerasByExistingMacAddressesQuery> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    protected readonly cameraRepo: CameraRepository,
  ) {}

  async execute(query: FindAllDeletedCamerasByExistingMacAddressesQuery) {
    const records = await this.cameraRepo.findAll({
      filter: {
        $and: [
          { macAddress: { $nin: query.filter?.existingCameraMacAddresses } },
        ],
      },
      orderBy: query.orderBy,
    });
    return records;
  }
}
