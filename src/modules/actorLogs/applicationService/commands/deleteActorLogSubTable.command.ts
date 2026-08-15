import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';

export class DeleteActorLogSubTableCommand extends Command {
  subTableName: string;

  constructor(props: CommandProps<DeleteActorLogSubTableCommand>) {
    super(props);
    this.subTableName = props.subTableName;
  }
}

@CommandHandler(DeleteActorLogSubTableCommand)
export class DeleteActorLogSubTableCommandHandler implements ICommandHandler<DeleteActorLogSubTableCommand> {
  constructor(
    @Inject(ACTOR_LOG_REPOSITORY)
    protected readonly actorLogRepo: ActorLogRepository,
  ) {}

  async execute(command: DeleteActorLogSubTableCommand): Promise<void> {
    await this.actorLogRepo.deleteSubTable(`${command.subTableName}-actorLog`);
  }
}
