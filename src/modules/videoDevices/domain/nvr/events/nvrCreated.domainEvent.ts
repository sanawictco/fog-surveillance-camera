import { DomainEvent, DomainEventProps } from 'src/dddLib/core';
import { CreateNvrProps } from '../nvr.type';

export class NvrCreatedDomainEvent
  extends DomainEvent
  implements CreateNvrProps
{
  readonly name: string;
  readonly serialNumber: string;
  readonly accessToken: string;
  readonly password: string;
  readonly tenantId: string;
  readonly maxCameras: number;
  readonly productModel: string;

  constructor(props: DomainEventProps<NvrCreatedDomainEvent>) {
    super(props);
    this.name = props.name;
    this.serialNumber = props.serialNumber;
    this.accessToken = props.accessToken;
    this.password = props.password;
    this.tenantId = props.tenantId;
    this.maxCameras = props.maxCameras;
    this.productModel = props.productModel;
  }
}
