import { DomainEvent, DomainEventProps } from 'src/dddLib/core';
import { UpdatePageProps } from '../page.type';
import { Widget } from '../valueObjects/pageContent.vo';

export class PageUpdatedDomainEvent
  extends DomainEvent
  implements UpdatePageProps
{
  readonly name?: string;
  readonly pageIndex?: number;
  readonly content?: Widget[];

  constructor(props: DomainEventProps<PageUpdatedDomainEvent>) {
    super(props);
    this.name = props.name;
    this.pageIndex = props.pageIndex;
    this.content = props.content;
  }
}
