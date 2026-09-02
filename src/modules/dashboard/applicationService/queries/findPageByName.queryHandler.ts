import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PAGE_REPOSITORY } from '../../infra/page.diToken';
import { PageRepository } from '../../infra/page.repository';

export class FindPageByNameQuery {
  constructor(public readonly name: string) {
    this.name = name;
  }
}
@QueryHandler(FindPageByNameQuery)
export class FindPageByNameQueryHandler implements IQueryHandler<FindPageByNameQuery> {
  constructor(
    @Inject(PAGE_REPOSITORY)
    protected readonly pageRepo: PageRepository,
  ) {}

  async execute(query: FindPageByNameQuery) {
    const record = await this.pageRepo.findOne({ name: query.name });
    return record;
  }
}
