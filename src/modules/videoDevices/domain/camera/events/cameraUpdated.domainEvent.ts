import { DomainEvent, DomainEventProps } from 'src/dddLib/core';
import { UpdateCameraProps } from '../camera.type';

export class CameraUpdatedDomainEvent
  extends DomainEvent
  implements UpdateCameraProps
{
  readonly name?: string;

  constructor(props: DomainEventProps<CameraUpdatedDomainEvent>) {
    super(props);
    this.name = props.name;
  }
}
