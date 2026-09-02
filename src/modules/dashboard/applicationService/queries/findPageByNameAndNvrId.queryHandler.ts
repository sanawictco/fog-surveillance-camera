import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PAGE_REPOSITORY } from '../../infra/page.diToken';
import { PageRepository } from '../../infra/page.repository';

export class FindPageByNameAndNvrIdQuery {
  constructor(
    public readonly name: string,
    public readonly nvrId: string,
  ) {
    this.name = name;
    this.nvrId = nvrId;
  }
}
@QueryHandler(FindPageByNameAndNvrIdQuery)
export class FindPageByNameAndNvrIdQueryHandler implements IQueryHandler<FindPageByNameAndNvrIdQuery> {
  constructor(
    @Inject(PAGE_REPOSITORY)
    protected readonly pageRepo: PageRepository,
  ) {}

  async execute(query: FindPageByNameAndNvrIdQuery) {
    const record = await this.pageRepo.findOne({
      name: query.name,
      nvrId: query.nvrId,
    });
    return record;
  }
}
