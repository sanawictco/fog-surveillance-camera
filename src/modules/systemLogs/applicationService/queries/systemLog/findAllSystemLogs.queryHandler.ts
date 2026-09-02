import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { TimeseriesQueryBase } from 'src/dddLib/applicationService';
import { FindDataParams } from 'src/dddLib/infra/timeseriesRepository.base';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import { SystemLogRepository } from 'src/modules/systemLogs/infra/repositories/systemLog.timeseriesRepository';
import { SYSTEM_LOG_REPOSITORY } from 'src/modules/systemLogs/infra/diToken/systemLog.diToken';
import {
  assertSystemLogTenantId,
  systemLogSelectedColumns,
  systemLogSuperTableName,
} from 'src/modules/systemLogs/domain/systemLog.type';

export class FindAllSystemLogsQuery extends TimeseriesQueryBase {
  tenantId: string;

  constructor(props: FindDataParams & { tenantId: string }) {
    super(props);
    assertSystemLogTenantId(props.tenantId);
    this.tenantId = props.tenantId;
  }
}
@QueryHandler(FindAllSystemLogsQuery)
export class FindAllSystemLogsQueryHandler implements IQueryHandler<FindAllSystemLogsQuery> {
  constructor(
    @Inject(SYSTEM_LOG_REPOSITORY)
    protected readonly systemLogRepo: SystemLogRepository,
  ) {}

  async execute(query: FindAllSystemLogsQuery) {
    await this.systemLogRepo.ensureSuperTable(query.tenantId);
    query.superTableName = systemLogSuperTableName(query.tenantId);
    query.selectedColumns = systemLogSelectedColumns;
    query.filter = `tenantId=${TimeSeriesDbExtension.quoteStringLiteral(query.tenantId)}`;
    const records = await this.systemLogRepo.findAll(query);
    return records;
  }
}
