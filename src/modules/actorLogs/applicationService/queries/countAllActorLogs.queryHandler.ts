import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';
import { TimeseriesQueryBase } from 'src/dddLib/applicationService';
import { CountDataParams } from 'src/dddLib/infra/timeseriesRepository.base';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import {
  actorLogSuperTableName,
  assertActorLogTenantId,
} from '../../domain/actorLog.type';

export class CountAllActorLogsQuery extends TimeseriesQueryBase {
  tenantId: string;
  constructor(props: CountDataParams & { tenantId: string }) {
    super(props);
    assertActorLogTenantId(props.tenantId);
    this.tenantId = props.tenantId;
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
    query.superTableName = actorLogSuperTableName(query.tenantId);
    query.filter = `tenantId=${TimeSeriesDbExtension.quoteStringLiteral(query.tenantId)}`;
    const records = await this.actorLogRepo.count(query);
    return records;
  }
}
