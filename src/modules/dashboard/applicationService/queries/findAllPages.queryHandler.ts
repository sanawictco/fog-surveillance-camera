import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PAGE_REPOSITORY } from '../../infra/diTokens/page.diToken';
import { PageRepository } from '../../infra/repositories/page.repository';
import { QueryBase } from 'src/dddLib/applicationService';
import { PageProps } from '../../domain/page.type';

export class FindAllPagesQuery extends QueryBase<PageProps> {}
@QueryHandler(FindAllPagesQuery)
export class FindAllPagesQueryHandler implements IQueryHandler<FindAllPagesQuery> {
  constructor(
    @Inject(PAGE_REPOSITORY)
    protected readonly pageRepo: PageRepository,
  ) {}

  async execute(query: FindAllPagesQuery) {
    const records = await this.pageRepo.findAll(query);
    return records;
  }
}
