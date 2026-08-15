import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ACTOR_LOG_SUPER_TABLE } from 'src/modules/actorLogs/domain/actorLog.type';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';

export class CreateActorLogSubTableCommand extends Command {
  subTableName: string;

  constructor(props: CommandProps<CreateActorLogSubTableCommand>) {
    super(props);
    this.subTableName = props.subTableName;
  }
}

@CommandHandler(CreateActorLogSubTableCommand)
export class CreateActorLogSubTableCommandHandler implements ICommandHandler<CreateActorLogSubTableCommand> {
  constructor(
    @Inject(ACTOR_LOG_REPOSITORY)
    protected readonly actorLogRepo: ActorLogRepository,
  ) {}

  async execute(command: CreateActorLogSubTableCommand): Promise<void> {
    await this.actorLogRepo.createSubTable({
      superTableName: ACTOR_LOG_SUPER_TABLE,
      subTableName: `${command.subTableName}-actorLog`,
    });
  }
}
