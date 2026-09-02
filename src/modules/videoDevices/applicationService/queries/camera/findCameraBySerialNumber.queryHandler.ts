import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { Inject } from '@nestjs/common';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';

export class FindCameraBySerialNumberQuery {
  constructor(
    public readonly serialNumber: string,
    public readonly nvrId: string,
  ) {
    this.serialNumber = serialNumber;
    this.nvrId = nvrId;
  }
}
@QueryHandler(FindCameraBySerialNumberQuery)
export class FindCameraBySerialNumberQueryHandler implements IQueryHandler<FindCameraBySerialNumberQuery> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    protected readonly cameraRepo: CameraRepository,
  ) {}

  async execute(query: FindCameraBySerialNumberQuery) {
    const record = await this.cameraRepo.findOne({
      serialNumber: query.serialNumber,
      nvrId: query.nvrId,
    });
    return record;
  }
}
