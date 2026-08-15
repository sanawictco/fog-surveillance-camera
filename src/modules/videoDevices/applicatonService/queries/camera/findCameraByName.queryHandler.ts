import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';

export class FindCameraByNameQuery {
  constructor(public readonly name: string) {
    this.name = name;
  }
}
@QueryHandler(FindCameraByNameQuery)
export class FindCameraByNameQueryHandler implements IQueryHandler<FindCameraByNameQuery> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    protected readonly cameraRepo: CameraRepository,
  ) {}

  async execute(query: FindCameraByNameQuery) {
    const record = await this.cameraRepo.findOne({ name: query.name });
    return record;
  }
}
