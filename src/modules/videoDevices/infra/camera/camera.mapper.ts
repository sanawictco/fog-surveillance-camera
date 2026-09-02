import { Injectable } from '@nestjs/common';
import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { Mapper } from 'src/dddLib/infra';
import { Name } from 'src/modules/shared/valueObjects/name.vo';
import { CameraResponseDto } from '../../contracts/camera/http/camera.response.dto';
import { CameraEntity } from '../../domain/camera/camera.entity';
import { HasAudio } from '../../domain/camera/valueObjects/hasAudio';
import { HasPtz } from '../../domain/camera/valueObjects/hasPtz.vo';
import { MacAddress } from '../../domain/camera/valueObjects/macAddress.vo';
import { Password } from '../../domain/camera/valueObjects/password.vo';
import { Port } from '../../domain/camera/valueObjects/port.vo';
import { ProductModel } from '../../domain/camera/valueObjects/productModel.vo';
import { Streams } from '../../domain/camera/valueObjects/streams.vo';
import { Username } from '../../domain/camera/valueObjects/username.vo';
import { IsActive } from '../../shared/valueObjects/isActive.vo';
import { LiveSignalStatus } from '../../shared/valueObjects/liveSignalStatus.vo';
import { SerialNumber } from '../../shared/valueObjects/serialNumber.vo';
import { CameraModel } from './camera.schema';

@Injectable()
export class CameraMapper implements Mapper<
  CameraEntity,
  CameraModel,
  CameraResponseDto
> {
  toPersistence(entity: CameraEntity): CameraModel {
    const copy = entity.getProps();
    const record: CameraModel = {
      id: copy.id,
      tenantId: copy.tenantId,
      name: copy.name,
      productModel: copy.productModel,
      serialNumber: copy.serialNumber,
      username: copy.username,
      password: copy.password,
      macAddress: copy.macAddress,
      port: copy.port,
      streams: copy.streams,
      hasPtz: copy.hasPtz,
      hasAudio: copy.hasAudio,
      nvrId: copy.nvrId,
      liveSignalStatus: copy.liveSignalStatus,
      isActive: copy.isActive,
      createdAt: copy.createdAt,
      updatedAt: copy.updatedAt,
    };
    return record;
  }

  toDomain(record: CameraModel): CameraEntity {
    const entity = new CameraEntity({
      id: record.id,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
      props: {
        tenantId: new BusinessId(record.tenantId),
        name: new Name(record.name),
        productModel: new ProductModel(record.productModel),
        serialNumber: new SerialNumber(record.serialNumber),
        username: new Username(record.username),
        password: new Password(record.password),
        macAddress: new MacAddress(record.macAddress),
        port: new Port(record.port),
        streams: new Streams(record.streams),
        hasPtz: new HasPtz(record.hasPtz),
        hasAudio: new HasAudio(record.hasAudio),
        nvrId: new BusinessId(record.nvrId),
        liveSignalStatus: new LiveSignalStatus(record.liveSignalStatus),
        isActive: new IsActive(record.isActive),
      },
    });
    return entity;
  }

  toResponse(entity: CameraEntity): CameraResponseDto {
    const props = entity.getProps();
    return new CameraResponseDto(props);
  }

  toResponseAll(entities: CameraEntity[]): CameraResponseDto[] {
    const responseArr: CameraResponseDto[] = [];
    for (const entity of entities) {
      responseArr.push(this.toResponse(entity));
    }
    return responseArr;
  }
}
