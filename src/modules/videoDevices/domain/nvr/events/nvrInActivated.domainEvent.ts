import { DomainEvent, DomainEventProps } from 'src/dddLib/core';

export class NvrInActivatedDomainEvent extends DomainEvent {
  readonly id: string;
  readonly name: string;

  constructor(props: DomainEventProps<NvrInActivatedDomainEvent>) {
    super(props);
    this.id = props.aggregateId;
    this.name = props.name;
  }
}
