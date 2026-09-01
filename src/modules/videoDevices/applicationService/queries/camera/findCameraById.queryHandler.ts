import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';

export class FindCameraByIdQuery {
  constructor(public readonly id: string) {
    this.id = id;
  }
}
@QueryHandler(FindCameraByIdQuery)
export class FindCameraByIdQueryHandler implements IQueryHandler<FindCameraByIdQuery> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    protected readonly cameraRepo: CameraRepository,
  ) {}

  async execute(query: FindCameraByIdQuery) {
    const record = await this.cameraRepo.findById(query.id);
    return record;
  }
}
