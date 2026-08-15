import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RepositoryBase } from 'src/dddLib/infra';
import { CacheService } from 'src/extensions/caching/cache.service';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { PageResponseDto } from '../../applicationService/contracts/page.response.dto';
import { PageEntity } from '../../domain/page.entity';
import { PageValueObjects } from '../../domain/page.type';
import { PageMapper } from '../mappers/page.mapper';
import { PageModel } from '../schemas/page.schema';
import { ParentRepository } from 'src/modules/shared/parent.repository';

@Injectable()
export class PageRepository
  extends ParentRepository<
    PageModel,
    PageValueObjects,
    PageEntity,
    PageResponseDto
  >
  implements RepositoryBase<PageEntity>
{
  constructor(
    @InjectModel(PageModel.name)
    protected readonly pageModel: Model<PageModel>,
    protected readonly mapper: PageMapper,
    protected readonly cache: CacheService<PageModel>,
    protected readonly serviceProvider: ServiceProvider,
  ) {
    super(pageModel, PageModel, mapper, cache, serviceProvider);
  }
}
