import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CacheService } from 'src/extensions/caching/cache.service';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { ParentRepository } from 'src/modules/shared/parent.repository';
import { RunningConfigs } from 'src/modules/shared/valueObjects/runningConfigs.vo';
import { NvrModel } from './nvr.schema';
import { NvrMapper } from './nvr.mapper';
import { NvrEntity } from '../../domain/nvr/nvr.entity';
import { NvrResponseDto } from '../../contracts/nvr/http/nvr.response.dto';
import { NvrValueObjects } from '../../domain/nvr/nvr.type';
import { TranslatorService } from 'src/extensions/translation/translatorService';

@Injectable()
export class NvrRepository extends ParentRepository<
  NvrModel,
  NvrValueObjects,
  NvrEntity,
  NvrResponseDto
> {
  constructor(
    @InjectModel(NvrModel.name)
    protected readonly nvrModel: Model<NvrModel>,
    protected readonly mapper: NvrMapper,
    protected readonly cache: CacheService<NvrModel>,
    protected readonly serviceProvider: ServiceProvider,
  ) {
    super(nvrModel, NvrModel, mapper, cache, serviceProvider);
  }

  async insert(entity: NvrEntity): Promise<void> {
    await super.insert(entity);
    TranslatorService.LANG = entity.getProps().lang;
  }

  async update(entity: NvrEntity): Promise<void> {
    await super.update(entity);
    TranslatorService.LANG = entity.getProps().lang;
  }

  async restoreAndInitRecordsToCache(): Promise<void> {
    const nvrs = await this.nvrModel.find().lean();
    for (const nvr of nvrs) {
      nvr.runningConfigs = RunningConfigs.init().unpack();
      await this.nvrModel.updateOne({ id: nvr.id }, nvr);
      await this.cache.set(`${NvrModel.name}:${nvr.id}`, nvr);
      TranslatorService.LANG = nvr.lang;
    }
  }
}
