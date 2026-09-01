import {
  Command,
  CommandProps,
  IdType,
} from 'src/dddLib/applicationService/command.base';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SYSTEM_LOG_REPOSITORY } from '../../infra/diToken/systemLog.diToken';
import { SystemLogRepository } from '../../infra/repositories/systemLog.timeseriesRepository';

export class DeleteAllSystemLogCommand extends Command {
  constructor(props: CommandProps<DeleteAllSystemLogCommand> & IdType) {
    super(props);
  }
}

@CommandHandler(DeleteAllSystemLogCommand)
export class DeleteAllSystemLogCommandHandler implements ICommandHandler<DeleteAllSystemLogCommand> {
  constructor(
    @Inject(SYSTEM_LOG_REPOSITORY)
    protected readonly systemLogRepo: SystemLogRepository,
  ) {}

  async execute(command: DeleteAllSystemLogCommand): Promise<void> {
    await this.systemLogRepo.deleteAll(command.id);
  }
}
