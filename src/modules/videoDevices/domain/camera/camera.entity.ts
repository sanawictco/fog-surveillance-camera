import { AggregateID, AggregateRoot } from 'src/dddLib/core';
import { v4 } from 'uuid';

import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { Name } from 'src/modules/shared/valueObjects/name.vo';

import AppConfig from 'configs/app.config';
import { IsActive } from '../../shared/valueObjects/isActive.vo';
import {
  LiveSignalStatus,
  LiveSignalStatuses,
} from '../../shared/valueObjects/liveSignalStatus.vo';
import { SerialNumber } from '../../shared/valueObjects/serialNumber.vo';
import {
  CameraFogPubToCloudMqttTopics,
  CameraFogSubOnCloudMqttTopics,
  CameraProps,
  CameraValueObjects,
  CreateCameraProps,
  UpdateCameraProps,
} from './camera.type';
import { CameraActivatedDomainEvent } from './events/cameraActivated.domainEvent';
import { CameraCreatedDomainEvent } from './events/cameraCreated.domainEvent';
import { CameraDeletedDomainEvent } from './events/cameraDeleted.domainEvent';
import { CameraInActivatedDomainEvent } from './events/cameraInActivated.domainEvent';
import { CameraUpdatedDomainEvent } from './events/cameraUpdated.domainEvent';
import { HasAudio } from './valueObjects/hasAudio';
import { HasPtz } from './valueObjects/hasPtz.vo';
import { MacAddress } from './valueObjects/macAddress.vo';
import { Password } from './valueObjects/password.vo';
import { Port } from './valueObjects/port.vo';
import { ProductModel } from './valueObjects/productModel.vo';
import { Streams } from './valueObjects/streams.vo';
import { Username } from './valueObjects/username.vo';

export class CameraEntity extends AggregateRoot<
  CameraValueObjects,
  CameraProps
> {
  declare protected readonly _id: AggregateID;
  static create(createCameraProps: CreateCameraProps): CameraEntity {
    let id;
    if (createCameraProps.originId) id = createCameraProps.originId;
    else id = v4();
    const {
      name,
      productModel,
      username,
      password,
      macAddress,
      port,
      streams,
      hasAudio,
      hasPtz,
      nvrId,
    } = createCameraProps;
    const props: CameraValueObjects = {
      name: new Name(name),
      tenantId: new BusinessId(createCameraProps.tenantId),
      productModel: new ProductModel(productModel),
      serialNumber: new SerialNumber(createCameraProps.serialNumber),
      username: new Username(username),
      password: new Password(password),
      macAddress: new MacAddress(macAddress),
      port: new Port(port),
      streams: new Streams(streams),
      hasPtz: new HasPtz(hasPtz),
      hasAudio: new HasAudio(hasAudio),
      nvrId: new BusinessId(nvrId),
      isActive: new IsActive(false),
      liveSignalStatus: LiveSignalStatus.init(),
    };
    const camera = new CameraEntity({ id, props });
    camera.addEvent(
      new CameraCreatedDomainEvent({
        aggregateId: id,
        ...camera.getProps(),
        metadata: {
          causationId: CameraCreatedDomainEvent.name,
        },
      }),
    );
    return camera;
  }

  update(updateCameraProps: UpdateCameraProps) {
    const updateCameraValueObjects: Partial<CameraValueObjects> = {
      name: this.createValueObjectIfDefined(updateCameraProps.name, Name),
      liveSignalStatus: this.createValueObjectIfDefined(
        updateCameraProps.liveSignalStatus,
        LiveSignalStatus,
      ),
    };
    const cleanedValueObjects = this.removeUndefinedProperties(
      updateCameraValueObjects,
    );

    const cleanedProps = this.removeUndefinedProperties(updateCameraProps);

    Object.assign(this.props, cleanedValueObjects);
    this.addEvent(
      new CameraUpdatedDomainEvent({
        ...cleanedProps,
        aggregateId: this.id,
      }),
    );
    return this;
  }

  active(): void {
    this.props.liveSignalStatus = new LiveSignalStatus(
      LiveSignalStatuses.CONNECTED,
    );
    this.props.isActive = new IsActive(true);
    this.addEvent(
      new CameraActivatedDomainEvent({
        aggregateId: this.id,
        name: this.props.name.unpack(),
      }),
    );
  }

  inactive(): void {
    this.props.isActive = new IsActive(false);
    this.props.liveSignalStatus = new LiveSignalStatus(
      LiveSignalStatuses.CONNECTED,
    );
    this.addEvent(
      new CameraInActivatedDomainEvent({
        aggregateId: this.id,
        name: this.props.name.unpack(),
      }),
    );
  }

  delete(): void {
    this.addEvent(
      new CameraDeletedDomainEvent({
        aggregateId: this.id,
      }),
    );
  }

  public getFogPubToCloudMqttTopics(): CameraFogPubToCloudMqttTopics {
    const mqttPublishTopicsObject: CameraFogPubToCloudMqttTopics = {
      cameraData: `${AppConfig().nvrId}/${this.id}/camera/data/sub`,
    };
    return Object.freeze(mqttPublishTopicsObject);
  }

  public static getFogSubOnCloudMqttTopics(): CameraFogSubOnCloudMqttTopics {
    const mqttSubscribeTopicsObject: CameraFogSubOnCloudMqttTopics = {
      cameraData: `${AppConfig().nvrId}/+/camera/data/pub`,
    };
    return Object.freeze(mqttSubscribeTopicsObject);
  }

  isConnected(): boolean {
    return this.getProps().liveSignalStatus === LiveSignalStatuses.CONNECTED;
  }

  isDisconnected(): boolean {
    return (
      this.getProps().liveSignalStatus === LiveSignalStatuses.DIS_CONNECTED
    );
  }

  validate(): void {}
}
