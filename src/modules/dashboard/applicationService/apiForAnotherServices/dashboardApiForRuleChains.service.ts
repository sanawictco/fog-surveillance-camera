import { Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { PageEntity } from '../../domain/page.entity';
import { Widget } from '../../domain/valueObjects/pageContent.vo';
import { UpdatePageCommand } from '../commands/updatePage.command';
import { FindAllPagesQuery } from '../queries/findAllPages.queryHandler';

@Injectable()
export class DashboardApiForRuleChainsService {
  constructor(private readonly serviceProvider: ServiceProvider) {}

  async deleteDeviceEffectFromWidgets(id: string) {
    const pageEntities: PageEntity[] =
      await this.serviceProvider.queryBus.execute(new FindAllPagesQuery());

    for (const pageEntity of pageEntities) {
      const pageProps = pageEntity.getProps();

      const content = pageProps.content as Widget[];
      const newContent: Widget[] = [];
      let updatable = false;
      for (const widget of content) {
        if (widget.id !== id) newContent.push(widget);
        else updatable = true;
      }
      if (updatable) {
        await this.serviceProvider.commandBus.execute(
          new UpdatePageCommand({
            id: pageEntity.id,
            content: newContent,
          }),
        );
      }
    }
  }
}
