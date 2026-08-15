import { DomainEvent, DomainEventProps } from 'src/dddLib/core';

export class CameraInActivatedDomainEvent extends DomainEvent {
  readonly id: string;
  readonly name: string;

  constructor(props: DomainEventProps<CameraInActivatedDomainEvent>) {
    super(props);
    this.id = props.aggregateId;
    this.name = props.name;
  }
}
