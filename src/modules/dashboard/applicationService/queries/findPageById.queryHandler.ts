import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PAGE_REPOSITORY } from '../../infra/page.diToken';
import { PageRepository } from '../../infra/page.repository';

export class FindPageByIdQuery {
  constructor(public readonly id: string) {
    this.id = id;
  }
}
@QueryHandler(FindPageByIdQuery)
export class FindPageByIdQueryHandler implements IQueryHandler<FindPageByIdQuery> {
  constructor(
    @Inject(PAGE_REPOSITORY)
    protected readonly pageRepo: PageRepository,
  ) {}

  async execute(query: FindPageByIdQuery) {
    const record = await this.pageRepo.findById(query.id);
    return record;
  }
}
