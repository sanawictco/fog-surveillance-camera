import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { TimeseriesQueryBase } from 'src/dddLib/applicationService';
import { CountDataParams } from 'src/dddLib/infra/timeseriesRepository.base';
import { SYSTEM_LOG_REPOSITORY } from '../../infra/diToken/systemLog.diToken';
import { SystemLogRepository } from '../../infra/repositories/systemLog.timeseriesRepository';
import { SYSTEM_LOG_SUPER_TABLE } from '../../domain/systemLog.type';

export class CountAllSystemLogsQuery extends TimeseriesQueryBase {
  constructor(props: CountDataParams) {
    super(props);
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
    query.superTableName = SYSTEM_LOG_SUPER_TABLE;
    const records = await this.systemLogRepo.count(query);
    return records;
  }
}
