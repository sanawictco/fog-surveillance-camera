import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PAGE_REPOSITORY } from '../../infra/diTokens/page.diToken';
import { PageRepository } from '../../infra/repositories/page.repository';

export class FindPageByNameAndGatewayIdQuery {
  constructor(
    public readonly name: string,
    public readonly gatewayId: string,
  ) {
    this.name = name;
    this.gatewayId = gatewayId;
  }
}
@QueryHandler(FindPageByNameAndGatewayIdQuery)
export class FindPageByNameAndGatewayIdQueryHandler implements IQueryHandler<FindPageByNameAndGatewayIdQuery> {
  constructor(
    @Inject(PAGE_REPOSITORY)
    protected readonly pageRepo: PageRepository,
  ) {}

  async execute(query: FindPageByNameAndGatewayIdQuery) {
    const record = await this.pageRepo.findOne({
      name: query.name,
      gatewayId: query.gatewayId,
    });
    return record;
  }
}
