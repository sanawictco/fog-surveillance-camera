import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  ActorLogRecordFormat,
  ActorLogTypes,
  CreateActorLogProps,
  assertActorLogTenantId,
  assertActorLogTypes,
} from 'src/modules/actorLogs/domain/actorLog.type';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';
import { ActorLogMessageProps } from '../../domain/valueObjects/actorLogMessage.vo';

export class CreateActorLogCommand
  extends Command
  implements CreateActorLogProps
{
  createdAt?: number;
  tenantId: string;
  actorType: ActorLogTypes;
  actorId: string;
  messageProps: ActorLogMessageProps;
  constructor(props: CommandProps<CreateActorLogCommand>) {
    super(props);
    assertActorLogTenantId(props.tenantId);
    assertActorLogTypes([props.actorType]);
    this.createdAt = props.createdAt;
    this.tenantId = props.tenantId;
    this.actorType = props.actorType;
    this.actorId = props.actorId;
    this.messageProps = props.messageProps;
  }
}

@CommandHandler(CreateActorLogCommand)
export class CreateActorLogCommandHandler implements ICommandHandler<CreateActorLogCommand> {
  constructor(
    @Inject(ACTOR_LOG_REPOSITORY)
    protected readonly actorLogRepo: ActorLogRepository,
  ) {}

  async execute(command: CreateActorLogCommand): Promise<void> {
    const { tenantId, actorType, actorId, messageProps, createdAt } = command;
    const actorLog: ActorLogRecordFormat = [
      tenantId,
      actorType,
      actorId,
      messageProps,
    ];
    await this.actorLogRepo.insert({
      data: actorLog,
      createdAt,
    });
  }
}
