import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { CameraProps } from '../../domain/camera/camera.type';
import { StreamsProps } from '../../domain/camera/valueObjects/streams.vo';
import { LiveSignalStatuses } from '../../shared/valueObjects/liveSignalStatus.vo';

@Schema({ collection: 'cameras' })
export class CameraModel implements CameraProps {
  @Prop({ unique: true, required: true })
  id: string;

  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  productModel: string;

  @Prop({ required: true })
  serialNumber: string;

  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  macAddress: string;

  @Prop({ required: true })
  port: number;

  @Prop({ required: true, type: StreamsProps })
  streams: StreamsProps;

  @Prop({ required: true })
  hasPtz: boolean;

  @Prop({ required: true })
  hasAudio: boolean;

  @Prop({ required: true })
  nvrId: string;

  @Prop({ required: true })
  isActive: boolean;

  @Prop({ required: true, type: String, enum: LiveSignalStatuses })
  liveSignalStatus: LiveSignalStatuses;

  @Prop({ default: new Date() })
  createdAt: Date;

  @Prop({ default: new Date() })
  updatedAt: Date;

  constructor(props?: CameraProps) {
    this.id = '';
    this.tenantId = props?.tenantId ?? '';
    this.name = props?.name ?? '';
    this.productModel = props?.productModel ?? '';
    this.serialNumber = props?.serialNumber ?? '';
    this.username = props?.username ?? '';
    this.password = props?.password ?? '';
    this.macAddress = props?.macAddress ?? '';
    this.port = props?.port ?? 0;
    this.streams =
      props?.streams ??
      ({
        recordStream: { token: '', path: '', resolutions: [] },
        liveStream: { token: '', path: '', resolutions: [] },
      } as StreamsProps);
    this.hasPtz = props?.hasPtz ?? false;
    this.hasAudio = props?.hasAudio ?? false;
    this.nvrId = props?.nvrId ?? '';
    this.isActive = props?.isActive ?? false;
    this.liveSignalStatus =
      props?.liveSignalStatus ?? LiveSignalStatuses.DIS_CONNECTED;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
}
export const CameraSchema = SchemaFactory.createForClass(CameraModel);
CameraSchema.index({ nvrId: 1, serialNumber: 1 }, { unique: true });
CameraSchema.index({ nvrId: 1, macAddress: 1 }, { unique: true });
