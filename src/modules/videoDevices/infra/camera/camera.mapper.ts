import { Injectable } from '@nestjs/common';
import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { Mapper } from 'src/dddLib/infra';
import { Name } from 'src/modules/shared/valueObjects/name.vo';
import { RunningConfigs } from 'src/modules/shared/valueObjects/runningConfigs.vo';
import { CameraResponseDto } from '../../contracts/camera/http/camera.response.dto';
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
import { CameraEntity } from '../../domain/camera/camera.entity';

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
      runningConfigs: copy.runningConfigs,
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
        runningConfigs: new RunningConfigs(record.runningConfigs),
      },
    });
    return entity;
  }

  toResponse(entity: CameraEntity): CameraResponseDto {
    const props = entity.getProps();
    const response = new CameraResponseDto(entity);
    response.name = props.name;
    response.productModel = props.productModel;
    response.macAddress = props.macAddress;
    response.port = props.port;
    response.streams = props.streams;
    response.hasPtz = props.hasPtz;
    response.hasAudio = props.hasAudio;
    return response;
  }

  toResponseAll(entities: CameraEntity[]): CameraResponseDto[] {
    const responseArr: CameraResponseDto[] = [];
    for (const entity of entities) {
      const props = entity.getProps();
      const response = new CameraResponseDto(entity);
      response.name = props.name;
      response.productModel = props.productModel;
      response.macAddress = props.macAddress;
      response.port = props.port;
      response.streams = props.streams;
      response.hasPtz = props.hasPtz;
      response.hasAudio = props.hasAudio;
      responseArr.push(response);
    }
    return responseArr;
  }
}
