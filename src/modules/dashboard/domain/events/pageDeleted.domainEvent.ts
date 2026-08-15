import { DomainEvent, DomainEventProps } from 'src/dddLib/core';

export class PageDeletedDomainEvent extends DomainEvent {
  constructor(props: DomainEventProps<PageDeletedDomainEvent>) {
    super(props);
  }
}
