import { BadRequestException, Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { CameraEntity } from 'src/modules/videoDevices/domain/camera/camera.entity';
import { FindCameraByIdQuery } from '../../../queries/camera/findCameraById.queryHandler';
import { FindCameraByNameQuery } from '../../../queries/camera/findCameraByName.queryHandler';

@Injectable()
export class CameraValidator {
  constructor(private readonly serviceProvider: ServiceProvider) {}
  async checkCameraShouldBeActiveAndHasConnectedStatus(
    cameraEntity: CameraEntity,
  ): Promise<void> {
    if (!cameraEntity.getProps().isActive)
      throw new BadRequestException('the camera is not active');
    else if (!cameraEntity.isConnected())
      throw new BadRequestException('the camera is not conncted');
  }

  async checkExistsCameraWithId(id: string): Promise<CameraEntity> {
    const cameraEntity: CameraEntity =
      await this.serviceProvider.queryBus.execute(new FindCameraByIdQuery(id));
    if (!cameraEntity) throw new BadRequestException('the camera not exist');
    return cameraEntity;
  }

  async checkCanCameraBeActive(cameraEntity: CameraEntity): Promise<void> {
    if (cameraEntity.getProps().isActive)
      throw new BadRequestException('the camera is active now');
  }

  async checkCanCameraBeInActive(cameraEntity: CameraEntity): Promise<void> {
    if (!cameraEntity.getProps().isActive)
      throw new BadRequestException('the camera is inactive now');
  }

  async checkAvoidCameraDuplicationUpdate(
    name: string,
    id: string,
  ): Promise<void> {
    const cameraEntity: CameraEntity =
      await this.serviceProvider.queryBus.execute(
        new FindCameraByNameQuery(name),
      );
    if (cameraEntity && cameraEntity.id !== id)
      throw new BadRequestException('the camera name is duplicated');
  }

  async checkCameraShouldBeActive(cameraEntity: CameraEntity): Promise<void> {
    if (!cameraEntity.getProps().isActive)
      throw new BadRequestException('the camera is not active');
  }
}
