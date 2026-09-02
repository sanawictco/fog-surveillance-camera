import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { TimeseriesQueryBase } from 'src/dddLib/applicationService';
import { CountDataParams } from 'src/dddLib/infra/timeseriesRepository.base';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import { SYSTEM_LOG_REPOSITORY } from 'src/modules/systemLogs/infra/diToken/systemLog.diToken';
import { SystemLogRepository } from 'src/modules/systemLogs/infra/repositories/systemLog.timeseriesRepository';
import {
  SystemLogTypes,
  assertSystemLogTenantId,
  assertSystemLogTypes,
  systemLogSuperTableName,
} from 'src/modules/systemLogs/domain/systemLog.type';

export class CountAllSystemLogsQuery extends TimeseriesQueryBase {
  tenantId: string;
  types: SystemLogTypes[];
  constructor(
    props: CountDataParams & {
      tenantId: string;
      types: SystemLogTypes[];
    },
  ) {
    super(props);
    assertSystemLogTenantId(props.tenantId);
    if (props.types.length) assertSystemLogTypes(props.types);
    this.tenantId = props.tenantId;
    this.types = props.types;
    this.superTableName = props.superTableName;
    this.subTableName = props.subTableName;
    this.timeRangeInUnix = props.timeRangeInUnix;
  }
}
@QueryHandler(CountAllSystemLogsQuery)
export class CountAllSystemLogsQueryHandler implements IQueryHandler<CountAllSystemLogsQuery> {
  constructor(
    @Inject(SYSTEM_LOG_REPOSITORY)
    protected readonly systemLogRepo: SystemLogRepository,
  ) {}

  async execute(query: CountAllSystemLogsQuery) {
    await this.systemLogRepo.ensureSuperTable(query.tenantId);
    query.superTableName = systemLogSuperTableName(query.tenantId);
    const typeFilters: string[] = [];
    if (query.types.length) {
      for (const type of query.types) {
        typeFilters.push(
          `groupId=${TimeSeriesDbExtension.quoteStringLiteral(type)}`,
        );
      }
    }
    query.filter = `tenantId=${TimeSeriesDbExtension.quoteStringLiteral(query.tenantId)}`;
    if (typeFilters.length > 0) {
      query.filter += ` AND (${typeFilters.join(' OR ')})`;
    }
    const records = await this.systemLogRepo.count(query);
    return records;
  }
}
