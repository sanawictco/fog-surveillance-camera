import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Command } from 'src/dddLib/applicationService/command.base';
import { SYSTEM_LOG_REPOSITORY } from '../../../infra/diToken/systemLog.diToken';
import { SYSTEM_LOG_SUPER_TABLE } from '../../../domain/systemLog.type';
import { SystemLogRepository } from '../../../infra/repositories/systemLog.timeseriesRepository';

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
    await this.actorLogRepo.clearSuperTable(SYSTEM_LOG_SUPER_TABLE);
  }
}
