import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { NVR_REPOSITORY } from '../../../infra/nvr/nvr.diToken';
import { NvrRepository } from '../../../infra/nvr/nvr.repository';

export class FindNvrByNameQuery {
  constructor(public readonly name: string) {
    this.name = name;
  }
}
@QueryHandler(FindNvrByNameQuery)
export class FindNvrByNameQueryHandler implements IQueryHandler<FindNvrByNameQuery> {
  constructor(
    @Inject(NVR_REPOSITORY)
    protected readonly nvrRepo: NvrRepository,
  ) {}

  async execute(query: FindNvrByNameQuery) {
    const record = await this.nvrRepo.findOne({ name: query.name });
    return record;
  }
}
