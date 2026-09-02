import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PaginatedTimeseriesQueryBase } from 'src/dddLib/applicationService';
import { Paginated } from 'src/dddLib/infra';
import { FindDataParams } from 'src/dddLib/infra/timeseriesRepository.base';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import { SystemLogRepository } from 'src/modules/systemLogs/infra/repositories/systemLog.timeseriesRepository';
import { SYSTEM_LOG_REPOSITORY } from 'src/modules/systemLogs/infra/diToken/systemLog.diToken';
import {
  SystemLogTypes,
  assertSystemLogTenantId,
  assertSystemLogTypes,
  systemLogSelectedColumns,
  systemLogSuperTableName,
} from 'src/modules/systemLogs/domain/systemLog.type';

export class FindAllPaginatedSystemLogsQuery extends PaginatedTimeseriesQueryBase {
  tenantId: string;
  types: SystemLogTypes[];
  constructor(
    props: FindDataParams & { page: number; limit: number } & {
      tenantId: string;
      types: SystemLogTypes[];
    },
  ) {
    super(props);
    assertSystemLogTenantId(props.tenantId);
    if (props.types.length) assertSystemLogTypes(props.types);
    this.tenantId = props.tenantId;
    this.types = props.types;
  }
}
@QueryHandler(FindAllPaginatedSystemLogsQuery)
export class FindAllPaginatedSystemLogsQueryHandler implements IQueryHandler<FindAllPaginatedSystemLogsQuery> {
  constructor(
    @Inject(SYSTEM_LOG_REPOSITORY)
    protected readonly systemLogRepo: SystemLogRepository,
  ) {}

  async execute(
    query: FindAllPaginatedSystemLogsQuery,
  ): Promise<Paginated<any>> {
    await this.systemLogRepo.ensureSuperTable(query.tenantId);
    query.superTableName = systemLogSuperTableName(query.tenantId);
    query.selectedColumns = systemLogSelectedColumns;
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
    const records = await this.systemLogRepo.findAllPaginated(query);
    return records;
  }
}
