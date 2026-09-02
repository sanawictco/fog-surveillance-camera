import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  CreateSystemLogProps,
  SystemLogMessageProps,
  SystemLogRecordFormat,
  SystemLogSections,
  SystemLogTypes,
  assertSystemLogTenantId,
  assertSystemLogTypes,
} from 'src/modules/systemLogs/domain/systemLog.type';
import { SYSTEM_LOG_REPOSITORY } from 'src/modules/systemLogs/infra/diToken/systemLog.diToken';
import { SystemLogRepository } from 'src/modules/systemLogs/infra/repositories/systemLog.timeseriesRepository';

export class CreateSystemLogCommand
  extends Command
  implements CreateSystemLogProps
{
  createdAt?: number;
  tenantId: string;
  entityId: string;
  type: SystemLogTypes;
  messageProps: SystemLogMessageProps;
  section: SystemLogSections;

  constructor(props: CommandProps<CreateSystemLogCommand>) {
    super(props);
    assertSystemLogTenantId(props.tenantId);
    assertSystemLogTypes([props.type]);
    this.createdAt = props.createdAt;
    this.tenantId = props.tenantId;
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
    const { tenantId, type, messageProps, section, entityId, createdAt } =
      command;
    const systemLog: SystemLogRecordFormat = [
      tenantId,
      type,
      messageProps,
      section,
      entityId,
    ];
    await this.systemLogRepo.insert({
      data: systemLog,
      createdAt,
    });
  }
}
