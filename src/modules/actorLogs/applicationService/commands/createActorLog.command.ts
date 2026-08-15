import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  ACTOR_LOG_SUPER_TABLE,
  ActorLogRecordFormat,
  ActorLogTypes,
  CreateActorLogProps,
} from 'src/modules/actorLogs/domain/actorLog.type';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';
import { ActorLogMessageProps } from '../../domain/valueObjects/actorLogMessage.vo';

export class CreateActorLogCommand
  extends Command
  implements CreateActorLogProps
{
  createdAt: number;
  actorType: ActorLogTypes;
  actorId: string;
  messageProps: ActorLogMessageProps;
  constructor(props: CommandProps<CreateActorLogCommand>) {
    super(props);
    this.createdAt = props.createdAt;
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
    const { createdAt, actorType, actorId, messageProps } = command;
    const actorLog: ActorLogRecordFormat = [
      createdAt,
      actorType,
      actorId,
      messageProps,
    ];
    await this.actorLogRepo.insert({
      superTableName: ACTOR_LOG_SUPER_TABLE,
      subTableName: command.actorId,
      data: actorLog,
    });
  }
}
