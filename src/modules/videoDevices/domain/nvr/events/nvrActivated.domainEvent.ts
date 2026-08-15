import { DomainEvent, DomainEventProps } from 'src/dddLib/core';

export class NvrActivatedDomainEvent extends DomainEvent {
  readonly id: string;
  readonly name: string;

  constructor(props: DomainEventProps<NvrActivatedDomainEvent>) {
    super(props);
    this.id = props.aggregateId;
    this.name = props.name;
  }
}
