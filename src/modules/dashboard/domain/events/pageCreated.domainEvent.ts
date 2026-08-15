import { DomainEvent, DomainEventProps } from 'src/dddLib/core';
import { CreatePageProps } from '../page.type';
import { Widget } from '../valueObjects/pageContent.vo';
import { PageTypes } from '../valueObjects/pageType.vo';

export class PageCreatedDomainEvent
  extends DomainEvent
  implements CreatePageProps
{
  readonly name: string;
  readonly nvrId: string;
  readonly type: PageTypes;
  readonly pageIndex: number;
  readonly content: Widget[];

  constructor(props: DomainEventProps<PageCreatedDomainEvent>) {
    super(props);
    this.name = props.name;
    this.nvrId = props.nvrId;
    this.type = props.type;
    this.pageIndex = props.pageIndex;
    this.content = props.content;
  }
}
