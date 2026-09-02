import { Injectable } from '@nestjs/common';
import { Mapper } from 'src/dddLib/infra';

import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { Name } from 'src/modules/shared/valueObjects/name.vo';
import { ProductModel } from '../../domain/camera/valueObjects/productModel.vo';
import { NvrEntity } from '../../domain/nvr/nvr.entity';
import { AccessToken } from '../../domain/nvr/valueObjects/accessToken.vo';
import { CloudFailedAt } from '../../domain/nvr/valueObjects/cloudFailedAt.vo';
import { MaxCameras } from '../../domain/nvr/valueObjects/maxCameras.vo';
import { NvrLanguage } from '../../domain/nvr/valueObjects/NvrLanguage.vo';
import { NvrPassword } from '../../domain/nvr/valueObjects/nvrPassword.vo';
import { IsActive } from '../../shared/valueObjects/isActive.vo';
import { LiveSignalStatus } from '../../shared/valueObjects/liveSignalStatus.vo';
import { SerialNumber } from '../../shared/valueObjects/serialNumber.vo';
import { NvrModel } from './nvr.schema';
import { NvrResponseDto } from '../../contracts/nvr/http/nvr.response.dto';

@Injectable()
export class NvrMapper implements Mapper<NvrEntity, NvrModel, NvrResponseDto> {
  toPersistence(entity: NvrEntity): NvrModel {
    const copy = entity.getProps();
    const record: NvrModel = {
      id: copy.id,
      name: copy.name,
      tenantId: copy.tenantId,
      maxCameras: copy.maxCameras,
      productModel: copy.productModel,
      serialNumber: copy.serialNumber,
      accessToken: copy.accessToken,
      password: copy.password,
      lang: copy.lang,
      isActive: copy.isActive,
      liveSignalStatus: copy.liveSignalStatus,
      cloudFailedAt: copy.cloudFailedAt,
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
        tenantId: new BusinessId(record.tenantId),
        maxCameras: new MaxCameras(record.maxCameras),
        productModel: new ProductModel(record.productModel),
        serialNumber: new SerialNumber(record.serialNumber),
        accessToken: new AccessToken(record.accessToken),
        password: new NvrPassword(record.password),
        lang: new NvrLanguage(record.lang),
        isActive: new IsActive(record.isActive),
        liveSignalStatus: new LiveSignalStatus(record.liveSignalStatus),
        cloudFailedAt: new CloudFailedAt(record.cloudFailedAt),
      },
    });
    return entity;
  }

  toResponse(entity: NvrEntity): NvrResponseDto {
    const props = entity.getProps();
    return new NvrResponseDto(
      props.id,
      props.name,
      props.tenantId,
      props.productModel,
      props.serialNumber,
      props.password,
      props.lang,
      props.isActive,
      props.liveSignalStatus,
      props.createdAt,
      props.updatedAt,
    );
  }

  toResponseAll(entities: NvrEntity[]): NvrResponseDto[] {
    const responseArr: NvrResponseDto[] = [];
    for (const entity of entities) {
      responseArr.push(this.toResponse(entity));
    }
    return responseArr;
  }
}
