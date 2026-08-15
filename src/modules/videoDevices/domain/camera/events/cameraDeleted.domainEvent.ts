import { DomainEvent, DomainEventProps } from 'src/dddLib/core';

export class CameraDeletedDomainEvent extends DomainEvent {
  constructor(props: DomainEventProps<CameraDeletedDomainEvent>) {
    super(props);
  }
}
