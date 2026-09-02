import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import AppConfig from 'configs/app.config';
import { Command } from 'src/dddLib/applicationService/command.base';
import { actorLogSuperTableName } from '../../domain/actorLog.type';
import { ACTOR_LOG_REPOSITORY } from '../../infra/actorLog.diToken';
import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';

export class ClearAllActorLogsCommand extends Command {
  constructor() {
    super({ id: '' });
  }
}

@CommandHandler(ClearAllActorLogsCommand)
export class ClearAllActorLogsCommandHandler implements ICommandHandler<ClearAllActorLogsCommand> {
  constructor(
    @Inject(ACTOR_LOG_REPOSITORY)
    protected readonly actorLogRepo: ActorLogRepository,
  ) {}

  async execute(_command: ClearAllActorLogsCommand): Promise<void> {
    await this.actorLogRepo.clearSuperTable(
      actorLogSuperTableName(AppConfig().tenantId),
    );
  }
}
