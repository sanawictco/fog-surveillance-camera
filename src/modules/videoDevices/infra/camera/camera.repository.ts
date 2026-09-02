import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RepositoryBase } from 'src/dddLib/infra';
import { CacheService } from 'src/extensions/caching/cache.service';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { CameraModel } from './camera.schema';
import { CameraValueObjects } from '../../domain/camera/camera.type';
import { ParentRepository } from 'src/modules/shared/parent.repository';
import { CameraMapper } from './camera.mapper';
import { CameraResponseDto } from '../../contracts/camera/http/camera.response.dto';
import { CameraEntity } from '../../domain/camera/camera.entity';

@Injectable()
export class CameraRepository
  extends ParentRepository<
    CameraModel,
    CameraValueObjects,
    CameraEntity,
    CameraResponseDto
  >
  implements RepositoryBase<CameraEntity>
{
  constructor(
    @InjectModel(CameraModel.name)
    protected readonly cameraModel: Model<CameraModel>,
    protected readonly mapper: CameraMapper,
    protected readonly cache: CacheService<CameraModel>,
    protected readonly serviceProvider: ServiceProvider,
  ) {
    super(cameraModel, CameraModel, mapper, cache, serviceProvider);
  }

  async restoreAndInitRecordsToCache(): Promise<void> {
    const cameras = await this.cameraModel.find().lean();
    for (const camera of cameras) {
      await this.cache.set(`${CameraModel.name}:${camera.id}`, camera);
    }
  }
}
