import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';
import { TimeseriesQueryBase } from 'src/dddLib/applicationService';
import { FindDataParams } from 'src/dddLib/infra/timeseriesRepository.base';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import {
  actorLogSelectedColumns,
  actorLogSuperTableName,
  assertActorLogTenantId,
} from '../../domain/actorLog.type';

export class FindAllActorLogsQuery extends TimeseriesQueryBase {
  tenantId: string;
  constructor(props: FindDataParams & { tenantId: string }) {
    super(props);
    assertActorLogTenantId(props.tenantId);
    this.tenantId = props.tenantId;
  }
}
@QueryHandler(FindAllActorLogsQuery)
export class FindAllActorLogsQueryHandler implements IQueryHandler<FindAllActorLogsQuery> {
  constructor(
    @Inject(ACTOR_LOG_REPOSITORY)
    protected readonly actorLogRepo: ActorLogRepository,
  ) {}

  async execute(query: FindAllActorLogsQuery) {
    query.superTableName = actorLogSuperTableName(query.tenantId);
    if (!query.selectedColumns) query.selectedColumns = actorLogSelectedColumns;
    query.filter = `tenantId=${TimeSeriesDbExtension.quoteStringLiteral(query.tenantId)}`;
    const records = await this.actorLogRepo.findAll(query);
    return records;
  }
}
