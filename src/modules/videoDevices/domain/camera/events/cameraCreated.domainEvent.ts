import { DomainEvent, DomainEventProps } from 'src/dddLib/core';
import { StreamsProps } from '../valueObjects/streams.vo';
import { CreateCameraProps } from '../camera.type';

export class CameraCreatedDomainEvent
  extends DomainEvent
  implements CreateCameraProps
{
  name: string;
  productModel: string;
  serialNumber: string;
  username: string;
  password: string;
  macAddress: string;
  port: number;
  streams: StreamsProps;
  hasPtz: boolean;
  hasAudio: boolean;
  nvrId: string;

  constructor(props: DomainEventProps<CameraCreatedDomainEvent>) {
    super(props);
    this.name = props.name;
    this.productModel = props.productModel;
    this.serialNumber = props.serialNumber;
    this.username = props.username;
    this.password = props.password;
    this.macAddress = props.macAddress;
    this.port = props.port;
    this.streams = props.streams;
    this.hasPtz = props.hasPtz;
    this.hasAudio = props.hasAudio;
    this.nvrId = props.nvrId;
  }
}
