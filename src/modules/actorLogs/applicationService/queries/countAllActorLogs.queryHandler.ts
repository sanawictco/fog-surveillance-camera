import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';
import { TimeseriesQueryBase } from 'src/dddLib/applicationService';
import { CountDataParams } from 'src/dddLib/infra/timeseriesRepository.base';

export class CountAllActorLogsQuery extends TimeseriesQueryBase {
  constructor(props: CountDataParams) {
    super(props);
    this.superTableName = props.superTableName;
    this.subTableName = props.subTableName;
    this.timeRangeInUnix = props.timeRangeInUnix;
  }
}
@QueryHandler(CountAllActorLogsQuery)
export class CountAllActorLogsQueryHandler implements IQueryHandler<CountAllActorLogsQuery> {
  constructor(
    @Inject(ACTOR_LOG_REPOSITORY)
    protected readonly actorLogRepo: ActorLogRepository,
  ) {}

  async execute(query: CountAllActorLogsQuery) {
    const records = await this.actorLogRepo.count(query);
    return records;
  }
}
