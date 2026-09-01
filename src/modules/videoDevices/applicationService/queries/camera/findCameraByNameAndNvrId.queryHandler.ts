import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';

export class FindCameraByNameAndNvrIdQuery {
  constructor(
    public readonly name: string,
    public readonly nvrId: string,
  ) {
    this.name = name;
    this.nvrId = nvrId;
  }
}
@QueryHandler(FindCameraByNameAndNvrIdQuery)
export class FindCameraByNameAndNvrIdQueryHandler implements IQueryHandler<FindCameraByNameAndNvrIdQuery> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    protected readonly cameraRepo: CameraRepository,
  ) {}

  async execute(query: FindCameraByNameAndNvrIdQuery) {
    const record = await this.cameraRepo.findOne({
      name: query.name,
      nvrId: query.nvrId,
    });
    return record;
  }
}
