import { Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { ClearAllSystemLogsCommand } from '../commands/clearAllSystemLogs.command';

@Injectable()
export class SystemLogApiForCloudConnectionService {
  constructor(private readonly serviceProvider: ServiceProvider) {}
  async clearData() {
    await this.serviceProvider.commandBus.execute(
      new ClearAllSystemLogsCommand(),
    );
  }
}
