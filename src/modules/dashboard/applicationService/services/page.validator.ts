import { BadRequestException, Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { PageEntity } from '../../domain/page.entity';
import { FindPageByIdQuery } from '../queries/findPageById.queryHandler';
import { FindPageByNameAndGatewayIdQuery } from '../queries/findPageByNameAndGatewayId.queryHandler';

@Injectable()
export class PageValidator {
  constructor(private readonly serviceProvider: ServiceProvider) {}
  async checkExistsPageWihtId(id: string) {
    const query = new FindPageByIdQuery(id);
    const pageEntity: PageEntity =
      await this.serviceProvider.queryBus.execute(query);
    if (!pageEntity) throw new BadRequestException('the page is not exist');
    return pageEntity;
  }

  async checkAvoidPageDuplicationCreate(name: string, gatewayId: string) {
    const query = new FindPageByNameAndGatewayIdQuery(name, gatewayId);
    const pageEntity: PageEntity =
      await this.serviceProvider.queryBus.execute(query);
    if (pageEntity)
      throw new BadRequestException('the page name is duplicated');
    return true;
  }

  async checkAvoidPageDuplicationUpdate(
    id: string,
    name: string,
    gatewayId: string,
  ) {
    const query = new FindPageByNameAndGatewayIdQuery(name, gatewayId);
    const pageEntity: PageEntity =
      await this.serviceProvider.queryBus.execute(query);
    if (pageEntity && pageEntity.id !== id)
      throw new BadRequestException('the page name is duplicated');
    return true;
  }
}
