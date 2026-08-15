import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';
import { PaginatedTimeseriesQueryBase } from 'src/dddLib/applicationService';
import { actorLogColumnNames } from '../../domain/actorLog.type';

export class FindAllPaginatedActorLogsQuery extends PaginatedTimeseriesQueryBase {}
@QueryHandler(FindAllPaginatedActorLogsQuery)
export class FindAllPaginatedActorLogsQueryHandler implements IQueryHandler<FindAllPaginatedActorLogsQuery> {
  constructor(
    @Inject(ACTOR_LOG_REPOSITORY)
    protected readonly actorLogRepo: ActorLogRepository,
  ) {}

  async execute(query: FindAllPaginatedActorLogsQuery) {
    if (!query.selectedColumns) query.selectedColumns = actorLogColumnNames;
    const records = await this.actorLogRepo.findAll(query);
    return records;
  }
}
