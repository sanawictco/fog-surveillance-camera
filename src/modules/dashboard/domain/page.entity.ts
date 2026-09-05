import { v4 } from 'uuid';
import { AggregateID, AggregateRoot } from 'src/dddLib/core';
import {
  CreatePageProps,
  PageProps,
  PageSubMqttTopics,
  PageValueObjects,
  UpdatePageProps,
} from './page.type';
import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { Page } from './valueObjects/pageType.vo';
import { PageIndex } from './valueObjects/pageIndex.vo';
import { PageContent } from './valueObjects/pageContent.vo';
import { PageCreatedDomainEvent } from './events/pageCreated.domainEvent';
import { PageUpdatedDomainEvent } from './events/pageUpdated.domainEvent';
import { PageDeletedDomainEvent } from './events/pageDeleted.domainEvent';
import AppConfig from 'configs/app.config';
import { Name } from 'src/modules/shared/valueObjects/name.vo';

export class PageEntity extends AggregateRoot<PageValueObjects, PageProps> {
  declare protected readonly _id: AggregateID;
  static create(createPageProps: CreatePageProps): PageEntity {
    let id;
    if (createPageProps.originId) id = createPageProps.originId;
    else id = v4();
    let pageIndex: number;
    if (createPageProps.pageIndex) pageIndex = createPageProps.pageIndex;
    else pageIndex = 0;
    const props: PageValueObjects = {
      ...createPageProps,
      tenantId: new BusinessId(createPageProps.tenantId),
      name: new Name(createPageProps.name),
      nvrId: new BusinessId(createPageProps.nvrId),
      type: new Page(createPageProps.type),
      pageIndex: new PageIndex(pageIndex),
      content: new PageContent([]),
    };
    const pageEntity = new PageEntity({ id, props });
    pageEntity.addEvent(
      new PageCreatedDomainEvent({
        aggregateId: id,
        ...pageEntity.getProps(),
      }),
    );
    return pageEntity;
  }

  update(updatePageProps: UpdatePageProps) {
    const updatePageValueObjects: Partial<PageValueObjects> = {
      name: this.createValueObjectIfDefined(updatePageProps.name, Name),
      pageIndex: this.createValueObjectIfDefined(
        updatePageProps.pageIndex,
        PageIndex,
      ),
      content: this.createValueObjectIfDefined(
        updatePageProps.content,
        PageContent,
      ),
    };
    const cleanedValueObjects = this.removeUndefinedProperties(
      updatePageValueObjects,
    );
    const cleanedProps = this.removeUndefinedProperties(updatePageProps);

    Object.assign(this.props, cleanedValueObjects);
    this.addEvent(
      new PageUpdatedDomainEvent({
        ...cleanedProps,
        aggregateId: this.id,
      }),
    );
    return this;
  }

  delete(): void {
    this.addEvent(
      new PageDeletedDomainEvent({
        aggregateId: this.id,
      }),
    );
  }

  static getFogPubToCloudMqttTopics() {
    const mqttPublishTopicsObject = {
      pageConfig: `tenants/${AppConfig().tenantId}/nvrs/${AppConfig().nvrId}/pages/to-cloud`,
    };
    return Object.freeze(mqttPublishTopicsObject);
  }

  public static getFogSubOnCloudMqttTopics() {
    const mqttSubscribeTopicsObject: PageSubMqttTopics = {
      pageConfigs: `tenants/${AppConfig().tenantId}/nvrs/${AppConfig().nvrId}/pages/to-fog`,
    };
    return Object.freeze(mqttSubscribeTopicsObject);
  }

  validate(): void {
    // entity business rules validation to protect it's invariant before saving entity to a database
    return;
  }
}
