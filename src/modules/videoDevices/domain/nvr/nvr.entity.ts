import AppConfig from 'configs/app.config';
import { AggregateID, AggregateRoot } from 'src/dddLib/core';
import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import { Name } from 'src/modules/shared/valueObjects/name.vo';
import { v4 } from 'uuid';
import { IsActive } from '../../shared/valueObjects/isActive.vo';
import {
  LiveSignalStatus,
  LiveSignalStatuses,
} from '../../shared/valueObjects/liveSignalStatus.vo';
import { SerialNumber } from '../../shared/valueObjects/serialNumber.vo';
import { NvrActivatedDomainEvent } from './events/nvrActivated.domainEvent';
import { NvrCreatedDomainEvent } from './events/nvrCreated.domainEvent';
import { NvrDeletedDomainEvent } from './events/nvrDeleted.domainEvent';
import { NvrInActivatedDomainEvent } from './events/nvrInActivated.domainEvent';
import { NvrUpdatedDomainEvent } from './events/nvrUpdated.domainEvent';
import {
  CreateNvrProps,
  NvrFogPubToCloudMqttTopics,
  NvrFogSubOnCloudMqttTopics,
  NvrProps,
  NvrValueObjects,
  UpdateNvrProps,
} from './nvr.type';
import { AccessToken } from './valueObjects/accessToken.vo';
import { CloudFailedAt } from './valueObjects/cloudFailedAt.vo';
import { MaxCameras } from './valueObjects/maxCameras.vo';
import { NvrLanguage } from './valueObjects/NvrLanguage.vo';
import { NvrPassword } from './valueObjects/nvrPassword.vo';
import { ProductModel } from '../camera/valueObjects/productModel.vo';

export class NvrEntity extends AggregateRoot<NvrValueObjects, NvrProps> {
  declare protected readonly _id: AggregateID;
  static create(createNvrProps: CreateNvrProps): NvrEntity {
    const id = v4();
    const props: NvrValueObjects = {
      name: new Name(createNvrProps.name),
      serialNumber: new SerialNumber(createNvrProps.serialNumber),
      accessToken: new AccessToken(createNvrProps.accessToken),
      tenantId: new BusinessId(createNvrProps.tenantId),
      password: new NvrPassword(createNvrProps.password),
      maxCameras: new MaxCameras(createNvrProps.maxCameras),
      productModel: new ProductModel(createNvrProps.productModel),
      lang: new NvrLanguage(LanguageCode.FA),
      isActive: IsActive.init(),
      liveSignalStatus: new LiveSignalStatus(LiveSignalStatuses.CONNECTED),
      cloudFailedAt: CloudFailedAt.init(),
    };
    const nvr = new NvrEntity({ id, props });
    nvr.addEvent(
      new NvrCreatedDomainEvent({
        aggregateId: id,
        ...nvr.getProps(),
      }),
    );
    return nvr;
  }

  update(updateNvrProps: UpdateNvrProps) {
    const { ...updateProps } = updateNvrProps;
    const updateNvrValueObjects: Partial<NvrValueObjects> = {
      name: this.createValueObjectIfDefined(updateProps.name, Name),
      password: this.createValueObjectIfDefined(
        updateProps.password,
        NvrPassword,
      ),
      lang: this.createValueObjectIfDefined(updateProps.lang, NvrLanguage),
      cloudFailedAt: this.createValueObjectIfDefined(
        updateProps.cloudFailedAt,
        CloudFailedAt,
      ),
    };

    const cleanedValueObjects = this.removeUndefinedProperties(
      updateNvrValueObjects,
    );
    const cleanedProps = this.removeUndefinedProperties(updateProps);

    Object.assign(this.props, cleanedValueObjects);

    this.addEvent(
      new NvrUpdatedDomainEvent({
        ...cleanedProps,
        aggregateId: this.id,
      }),
    );
    return this;
  }

  active(): void {
    this.props.isActive = new IsActive(true);
    this.addEvent(
      new NvrActivatedDomainEvent({
        aggregateId: this.id,
        name: this.props.name.unpack(),
      }),
    );
  }

  inactive(): void {
    this.props.isActive = new IsActive(false);
    this.addEvent(
      new NvrInActivatedDomainEvent({
        aggregateId: this.id,
        name: this.props.name.unpack(),
      }),
    );
  }

  delete(): void {
    this.addEvent(
      new NvrDeletedDomainEvent({
        aggregateId: this.id,
      }),
    );
  }

  public static getFogPubToCloudMqttTopics(): NvrFogPubToCloudMqttTopics {
    const nvrId = AppConfig().nvrId;
    const tenantId = AppConfig().tenantId;
    const mqttPublishTopicsObject: NvrFogPubToCloudMqttTopics = {
      videoDeviceSoftwareConfigs: `${tenantId}/${nvrId}/videoDevice/Config/sub`,
      videoDeviceSystemLogs: `${tenantId}/${nvrId}/videoDevice/systemLogs/sub`,
    };
    return Object.freeze(mqttPublishTopicsObject);
  }

  public static getFogSubOnCloudMqttTopics(): NvrFogSubOnCloudMqttTopics {
    const nvrId = AppConfig().nvrId;
    const tenantId = AppConfig().tenantId;
    const mqttSubscribeTopicsObject: NvrFogSubOnCloudMqttTopics = {
      videoDeviceSoftwareConfigs: `${tenantId}/${nvrId}/videoDevice/Config/pub`,
      cloudRecoveryDataAck: `${tenantId}/${nvrId}/cloudRecoveryData/pub`,
      cloudIsAvailable: `${tenantId}/${nvrId}/cloudIsAvailable/pub`,
      pageConfig: `${tenantId}/${nvrId}/page/config/pub`,
    };
    return Object.freeze(mqttSubscribeTopicsObject);
  }
  public validate(): void {}
}
