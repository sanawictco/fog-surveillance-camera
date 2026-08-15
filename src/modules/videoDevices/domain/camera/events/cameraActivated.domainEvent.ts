import { DomainEvent, DomainEventProps } from 'src/dddLib/core';

export class CameraActivatedDomainEvent extends DomainEvent {
  readonly id: string;
  readonly name: string;

  constructor(props: DomainEventProps<CameraActivatedDomainEvent>) {
    super(props);
    this.id = props.aggregateId;
    this.name = props.name;
  }
}
