import {
  Command,
  CommandProps,
  IdType,
} from 'src/dddLib/applicationService/command.base';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { assertSystemLogTenantId } from 'src/modules/systemLogs/domain/systemLog.type';
import { SYSTEM_LOG_REPOSITORY } from 'src/modules/systemLogs/infra/diToken/systemLog.diToken';
import { SystemLogRepository } from 'src/modules/systemLogs/infra/repositories/systemLog.timeseriesRepository';

export class DeleteAllSystemLogCommand extends Command {
  readonly tenantId: string;

  constructor(
    props: CommandProps<DeleteAllSystemLogCommand> &
      IdType & { tenantId: string },
  ) {
    super(props);
    assertSystemLogTenantId(props.tenantId);
    this.tenantId = props.tenantId;
  }
}

@CommandHandler(DeleteAllSystemLogCommand)
export class DeleteAllSystemLogCommandHandler implements ICommandHandler<DeleteAllSystemLogCommand> {
  constructor(
    @Inject(SYSTEM_LOG_REPOSITORY)
    protected readonly systemLogRepo: SystemLogRepository,
  ) {}

  async execute(command: DeleteAllSystemLogCommand): Promise<void> {
    await this.systemLogRepo.deleteAll(command.tenantId, command.id);
  }
}
