import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';
import { TimeseriesQueryBase } from 'src/dddLib/applicationService';
import { actorLogColumnNames } from '../../domain/actorLog.type';

export class FindAllActorLogsQuery extends TimeseriesQueryBase {}
@QueryHandler(FindAllActorLogsQuery)
export class FindAllActorLogsQueryHandler implements IQueryHandler<FindAllActorLogsQuery> {
  constructor(
    @Inject(ACTOR_LOG_REPOSITORY)
    protected readonly actorLogRepo: ActorLogRepository,
  ) {}

  async execute(query: FindAllActorLogsQuery) {
    if (!query.selectedColumns) query.selectedColumns = actorLogColumnNames;
    const records = await this.actorLogRepo.findAll(query);
    return records;
  }
}
