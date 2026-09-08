import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsMACAddress,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { StreamsProps } from '../../domain/camera/valueObjects/streams.vo';
import { AggregateID } from 'src/dddLib/core';
import { DiscoveredCamera } from '../../infra/discoveredCamera/discoveredCamera.types';

export class FogRegisterCameraDto {
  @IsUUID('4')
  id!: string;

  @IsUUID('4')
  tenantId!: string;

  @IsString()
  @Length(1, 60)
  name!: string;

  @IsString()
  @Length(1, 100)
  productModel!: string;

  @Length(8, 8)
  @Matches(/^[A-Z0-9]{8}$/)
  serialNumber!: string;

  @IsString()
  username!: string;

  @IsString()
  password!: string;

  @IsMACAddress()
  macAddress!: string;

  @IsInt()
  port!: number;

  @IsObject()
  streams!: StreamsProps;

  @IsBoolean()
  hasPtz!: boolean;

  @IsBoolean()
  hasAudio!: boolean;

  @IsUUID('4')
  nvrId!: string;
}

export class FogDeleteCameraDto {
  @IsUUID('4')
  id!: string;

  @Length(8, 8)
  @Matches(/^[A-Z0-9]{8}$/)
  serialNumber!: string;

  @IsString()
  productModel!: string;

  @IsString()
  name!: string;
}

export class FogRegisterConfigDataDto {
  @IsUUID('4')
  nvrId!: string;

  @IsUUID('4')
  tenantId!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((camera: FogRegisterCameraDto) => camera.serialNumber)
  @ValidateNested({ each: true })
  @Type(() => FogRegisterCameraDto)
  addedCameras!: FogRegisterCameraDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((camera: FogDeleteCameraDto) => camera.serialNumber)
  @ValidateNested({ each: true })
  @Type(() => FogDeleteCameraDto)
  deletedCameras!: FogDeleteCameraDto[];
}

export class FogRegisterConfigDto {
  @Matches(/^register$/)
  configType!: 'register';

  @ValidateNested()
  @Type(() => FogRegisterConfigDataDto)
  data!: FogRegisterConfigDataDto;
}

export interface OperatoinOnMultiCamerasMqttRequestDto {
  cameraIds: AggregateID[];
}

// Derived from the producer so the published shape cannot drift: any field added to
// DiscoveredCamera appears here automatically, and interfaceName stays excluded by
// construction rather than by convention (it is a fog-local detail cloud must not see).
export type DiscoveredCameraDto = Omit<DiscoveredCamera, 'interfaceName'>;
