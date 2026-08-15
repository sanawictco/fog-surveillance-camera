import { Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { ClearAllActorLogsCommand } from '../commands/clearAllActorLogs.command';

@Injectable()
export class ActorLogApiForCloudConnectionService {
  constructor(private readonly serviceProvider: ServiceProvider) {}
  async clearData() {
    await this.serviceProvider.commandBus.execute(
      new ClearAllActorLogsCommand(),
    );
  }
}
