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

export class DiscoveredCameraDto {
  macAddress?: string;
  endpointReference?: string;
  ipAddress!: string;
  status!: string;
  discoveredVia!: string[];
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
  onvifXaddr?: string;
  suggestedName?: string;
  hasPtz?: boolean;
  hasAudio?: boolean;
  streams?: StreamsProps;
  multiHomed?: boolean;
  conflictMacAddresses?: string[];
  conflictEndpointReferences?: string[];
}
