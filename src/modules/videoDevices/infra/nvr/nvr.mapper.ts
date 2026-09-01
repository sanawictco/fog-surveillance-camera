import { Mapper } from 'src/dddLib/infra';
import { Injectable } from '@nestjs/common';

import { RunningConfigs } from 'src/modules/shared/valueObjects/runningConfigs.vo';
import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { Name } from 'src/modules/shared/valueObjects/name.vo';

import { NvrEntity } from '../../domain/nvr/nvr.entity';
import { NvrModel } from './nvr.schema';
import { NvrResponseDto } from '../../contracts/nvr/http/nvr.response.dto';
import { MaxCameras } from '../../domain/nvr/valueObjects/maxCameras.vo';
import { SerialNumber } from '../../shared/valueObjects/serialNumber.vo';
import { AccessToken } from '../../domain/nvr/valueObjects/accessToken.vo';
import { NvrPassword } from '../../domain/nvr/valueObjects/nvrPassword.vo';
import { NvrLanguage } from '../../domain/nvr/valueObjects/NvrLanguage.vo';
import { IsActive } from '../../shared/valueObjects/isActive.vo';
import { LiveSignalStatus } from '../../shared/valueObjects/liveSignalStatus.vo';
import { CloudIsRecovering } from '../../domain/nvr/valueObjects/cloudIsRecovering.vo';
import { CloudFailedAt } from '../../domain/nvr/valueObjects/cloudFailedAt.vo';

@Injectable()
export class NvrMapper implements Mapper<NvrEntity, NvrModel, NvrResponseDto> {
  toPersistence(entity: NvrEntity): NvrModel {
    const copy = entity.getProps();
    const record: NvrModel = {
      id: copy.id,
      name: copy.name,
      workstationId: copy.workstationId,
      maxCameras: copy.maxCameras,
      serialNumber: copy.serialNumber,
      accessToken: copy.accessToken,
      password: copy.password,
      lang: copy.lang,
      isActive: copy.isActive,
      liveSignalStatus: copy.liveSignalStatus,
      cloudIsRecovering: copy.cloudIsRecovering,
      cloudFailedAt: copy.cloudFailedAt,
      runningConfigs: copy.runningConfigs,
      createdAt: copy.createdAt,
      updatedAt: copy.updatedAt,
    };
    return record;
  }

  toDomain(record: NvrModel): NvrEntity {
    const entity = new NvrEntity({
      id: record.id,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
      props: {
        name: new Name(record.name),
        workstationId: new BusinessId(record.workstationId),
        maxCameras: new MaxCameras(record.maxCameras),
        serialNumber: new SerialNumber(record.serialNumber),
        accessToken: new AccessToken(record.accessToken),
        password: new NvrPassword(record.password),
        lang: new NvrLanguage(record.lang),
        isActive: new IsActive(record.isActive),
        liveSignalStatus: new LiveSignalStatus(record.liveSignalStatus),
        cloudIsRecovering: new CloudIsRecovering(record.cloudIsRecovering),
        cloudFailedAt: new CloudFailedAt(record.cloudFailedAt),
        runningConfigs: new RunningConfigs(record.runningConfigs),
      },
    });
    return entity;
  }

  toResponse(entity: NvrEntity): NvrResponseDto {
    const props = entity.getProps();
    const response = new NvrResponseDto(entity);
    response.name = props.name;
    response.workstationId = props.workstationId;
    response.serialNumber = props.serialNumber;
    response.password = props.password;
    response.lang = props.lang;
    response.isActive = props.isActive;
    response.liveSignalStatus = props.liveSignalStatus;

    return response;
  }

  toResponseAll(entities: NvrEntity[]): NvrResponseDto[] {
    const responseArr: NvrResponseDto[] = [];
    for (const entity of entities) {
      const props = entity.getProps();
      const response = new NvrResponseDto(entity);
      response.name = props.name;
      response.workstationId = props.workstationId;
      response.serialNumber = props.serialNumber;
      response.password = props.password;
      response.lang = props.lang;
      response.isActive = props.isActive;
      response.liveSignalStatus = props.liveSignalStatus;

      responseArr.push(response);
    }
    return responseArr;
  }
}
