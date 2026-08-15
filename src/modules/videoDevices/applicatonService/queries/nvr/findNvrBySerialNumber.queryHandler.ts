import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { Inject } from '@nestjs/common';
import { NVR_REPOSITORY } from '../../../infra/nvr/nvr.diToken';
import { NvrRepository } from '../../../infra/nvr/nvr.repository';

export class FindNvrBySerialNumberQuery {
  constructor(public readonly serialNumber: string) {
    this.serialNumber = serialNumber;
  }
}
@QueryHandler(FindNvrBySerialNumberQuery)
export class FindNvrBySerialNumberQueryHandler implements IQueryHandler<FindNvrBySerialNumberQuery> {
  constructor(
    @Inject(NVR_REPOSITORY)
    protected readonly nvrRepo: NvrRepository,
  ) {}

  async execute(query: FindNvrBySerialNumberQuery) {
    const record = await this.nvrRepo.findOne({
      serialNumber: query.serialNumber,
    });
    return record;
  }
}
