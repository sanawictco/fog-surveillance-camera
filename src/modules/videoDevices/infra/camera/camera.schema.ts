import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { CameraProps } from '../../domain/camera/camera.type';
import { StreamsProps } from '../../domain/camera/valueObjects/streams.vo';
import { LiveSignalStatuses } from '../../shared/valueObjects/liveSignalStatus.vo';

@Schema({ collection: 'cameras' })
export class CameraModel implements CameraProps {
  @Prop({ unique: true, required: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  productModel!: string;

  @Prop({ required: true })
  serialNumber!: string;

  @Prop({ required: true })
  username!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ required: true })
  macAddress!: string;

  @Prop({ required: true })
  port!: number;

  @Prop({ required: true, type: StreamsProps })
  streams!: StreamsProps;

  @Prop({ required: true })
  hasPtz!: boolean;

  @Prop({ required: true })
  hasAudio!: boolean;

  @Prop({ required: true })
  nvrId!: string;

  @Prop({ required: true })
  isActive!: boolean;

  @Prop({ required: true, type: String, enum: LiveSignalStatuses })
  liveSignalStatus!: LiveSignalStatuses;

  @Prop({ default: new Date() })
  createdAt!: Date;

  @Prop({ default: new Date() })
  updatedAt!: Date;

  @Prop({ type: Object, required: true })
  runningConfigs!: Record<string, string>;
}
export const CameraSchema = SchemaFactory.createForClass(CameraModel);
CameraSchema.index({ nvrId: 1, serialNumber: 1 }, { unique: true });
CameraSchema.index({ nvrId: 1, macAddress: 1 }, { unique: true });
