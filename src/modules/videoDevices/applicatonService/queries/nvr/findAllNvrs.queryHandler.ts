import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { QueryBase } from 'src/dddLib/applicationService';
import { NVR_REPOSITORY } from '../../../infra/nvr/nvr.diToken';
import { NvrRepository } from '../../../infra/nvr/nvr.repository';
interface NvrQueryFilter {
  name: string | RegExp;
  isActive: boolean;
}

export class FindAllNvrsQuery extends QueryBase<NvrQueryFilter> {}
@QueryHandler(FindAllNvrsQuery)
export class FindAllNvrsQueryHandler implements IQueryHandler<FindAllNvrsQuery> {
  constructor(
    @Inject(NVR_REPOSITORY)
    protected readonly nvrRepo: NvrRepository,
  ) {}

  async execute(query: FindAllNvrsQuery) {
    const records = await this.nvrRepo.findAll(query);
    return records;
  }
}
