import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { NVR_REPOSITORY } from '../../../infra/nvr/nvr.diToken';
import { NvrRepository } from '../../../infra/nvr/nvr.repository';

export class FindNvrByIdQuery {
  constructor(public readonly id: string) {
    this.id = id;
  }
}
@QueryHandler(FindNvrByIdQuery)
export class FindNvrByIdQueryHandler implements IQueryHandler<FindNvrByIdQuery> {
  constructor(
    @Inject(NVR_REPOSITORY)
    protected readonly nvrRepo: NvrRepository,
  ) {}

  async execute(query: FindNvrByIdQuery) {
    const record = await this.nvrRepo.findById(query.id);
    return record;
  }
}
