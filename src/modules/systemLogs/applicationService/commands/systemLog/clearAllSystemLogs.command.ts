import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import AppConfig from 'configs/app.config';
import { Command } from 'src/dddLib/applicationService/command.base';
import { SYSTEM_LOG_REPOSITORY } from 'src/modules/systemLogs/infra/diToken/systemLog.diToken';
import { systemLogSuperTableName } from 'src/modules/systemLogs/domain/systemLog.type';
import { SystemLogRepository } from 'src/modules/systemLogs/infra/repositories/systemLog.timeseriesRepository';

export class ClearAllSystemLogsCommand extends Command {
  constructor() {
    super({ id: '' });
  }
}

@CommandHandler(ClearAllSystemLogsCommand)
export class ClearAllSystemLogsCommandHandler implements ICommandHandler<ClearAllSystemLogsCommand> {
  constructor(
    @Inject(SYSTEM_LOG_REPOSITORY)
    protected readonly actorLogRepo: SystemLogRepository,
  ) {}

  async execute(_command: ClearAllSystemLogsCommand): Promise<void> {
    await this.actorLogRepo.clearSuperTable(
      systemLogSuperTableName(AppConfig().tenantId),
    );
  }
}
