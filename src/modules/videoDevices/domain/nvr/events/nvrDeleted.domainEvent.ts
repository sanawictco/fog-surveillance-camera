import { DomainEvent, DomainEventProps } from 'src/dddLib/core';

export class NvrDeletedDomainEvent extends DomainEvent {
  constructor(props: DomainEventProps<NvrDeletedDomainEvent>) {
    super(props);
  }
}
