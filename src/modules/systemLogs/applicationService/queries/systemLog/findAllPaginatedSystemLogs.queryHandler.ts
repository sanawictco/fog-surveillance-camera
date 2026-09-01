import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PaginatedTimeseriesQueryBase } from 'src/dddLib/applicationService';
import { Paginated } from 'src/dddLib/infra';
import { SystemLogRepository } from '../../infra/repositories/systemLog.timeseriesRepository';
import { SYSTEM_LOG_REPOSITORY } from '../../infra/diToken/systemLog.diToken';
import {
  SYSTEM_LOG_SUPER_TABLE,
  SystemLogTypes,
} from '../../domain/systemLog.type';
import { FindDataParams } from 'src/dddLib/infra/timeseriesRepository.base';

export class FindAllPaginatedSystemLogsQuery extends PaginatedTimeseriesQueryBase {
  types: SystemLogTypes[];
  constructor(
    props: FindDataParams & { page: number; limit: number } & {
      types: SystemLogTypes[];
    },
  ) {
    super(props);
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
    query.superTableName = SYSTEM_LOG_SUPER_TABLE;
    if (query.types.length) {
      const _filterOptions: string[] = [];
      for (const type of query.types) {
        _filterOptions.push('groupId=' + `'${type}'`);
      }
      query.filter = _filterOptions.join(' OR ');
    }
    const records = await this.systemLogRepo.findAllPaginated(query);
    return records;
  }
}
