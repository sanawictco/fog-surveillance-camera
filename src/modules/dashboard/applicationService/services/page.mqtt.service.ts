import { Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { CreatePageCommand } from '../commands/createPage.command';
import { UpdatePageCommand } from '../commands/updatePage.command';
import { DeletePageCommand } from '../commands/deletePage.command';
import { DashboardCloudCommunicationService } from './dashboardCloudCommunicationService';
import { CreatePageProps, UpdatePageProps } from '../../domain/page.type';

@Injectable()
export class PageMqttService {
  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly dashboardCloudCommunicationService: DashboardCloudCommunicationService,
  ) {}

  async create(
    msgId: string,
    data: CreatePageProps & { id: string },
  ): Promise<void> {
    await this.serviceProvider.commandBus.execute(
      new CreatePageCommand({
        ...data,
        originId: data.id,
      }),
    );
    await this.dashboardCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
    });
  }

  async update(
    msgId: string,
    data: UpdatePageProps & { id: string },
  ): Promise<void> {
    await this.serviceProvider.commandBus.execute(new UpdatePageCommand(data));
    await this.dashboardCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
    });
  }

  async delete(msgId: string, data: { id: string }): Promise<void> {
    await this.serviceProvider.commandBus.execute(
      new DeletePageCommand({ id: data.id }),
    );
    await this.dashboardCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
    });
  }
}
