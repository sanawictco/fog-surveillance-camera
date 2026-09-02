import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';
import { PaginatedTimeseriesQueryBase } from 'src/dddLib/applicationService';
import { FindDataParams } from 'src/dddLib/infra/timeseriesRepository.base';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import {
  actorLogSelectedColumns,
  actorLogSuperTableName,
  assertActorLogTenantId,
} from '../../domain/actorLog.type';

export class FindAllPaginatedActorLogsQuery extends PaginatedTimeseriesQueryBase {
  tenantId: string;
  constructor(
    props: FindDataParams & { page: number; limit: number; tenantId: string },
  ) {
    super(props);
    assertActorLogTenantId(props.tenantId);
    this.tenantId = props.tenantId;
  }
}
@QueryHandler(FindAllPaginatedActorLogsQuery)
export class FindAllPaginatedActorLogsQueryHandler implements IQueryHandler<FindAllPaginatedActorLogsQuery> {
  constructor(
    @Inject(ACTOR_LOG_REPOSITORY)
    protected readonly actorLogRepo: ActorLogRepository,
  ) {}

  async execute(query: FindAllPaginatedActorLogsQuery) {
    query.superTableName = actorLogSuperTableName(query.tenantId);
    if (!query.selectedColumns) query.selectedColumns = actorLogSelectedColumns;
    query.filter = `tenantId=${TimeSeriesDbExtension.quoteStringLiteral(query.tenantId)}`;
    const records = await this.actorLogRepo.findAllPaginated(query);
    return records;
  }
}
