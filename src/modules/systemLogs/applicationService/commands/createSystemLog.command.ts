import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  CreateSystemLogProps,
  SYSTEM_LOG_SUPER_TABLE,
  SystemLogMessageProps,
  SystemLogRecordFormat,
  SystemLogSections,
  SystemLogTypes,
} from 'src/modules/systemLogs/domain/systemLog.type';
import { SYSTEM_LOG_REPOSITORY } from '../../infra/diToken/systemLog.diToken';
import { SystemLogRepository } from '../../infra/repositories/systemLog.timeseriesRepository';

export class CreateSystemLogCommand
  extends Command
  implements CreateSystemLogProps
{
  createdAt: number;
  entityId: string;
  type: SystemLogTypes;
  messageProps: SystemLogMessageProps;
  section: SystemLogSections;

  constructor(props: CommandProps<CreateSystemLogCommand>) {
    super(props);
    this.createdAt = props.createdAt;
    this.type = props.type;
    this.messageProps = props.messageProps;
    this.section = props.section;
    this.entityId = props.entityId;
  }
}

@CommandHandler(CreateSystemLogCommand)
export class CreateSystemLogCommandHandler implements ICommandHandler<CreateSystemLogCommand> {
  constructor(
    @Inject(SYSTEM_LOG_REPOSITORY)
    protected readonly systemLogRepo: SystemLogRepository,
  ) {}

  async execute(command: CreateSystemLogCommand): Promise<void> {
    const { type, messageProps, section, entityId } = command;
    const systemLog: SystemLogRecordFormat = [messageProps, section, entityId];
    await this.systemLogRepo.insert({
      superTableName: SYSTEM_LOG_SUPER_TABLE,
      subTableName: type,
      data: systemLog,
    });
  }
}
