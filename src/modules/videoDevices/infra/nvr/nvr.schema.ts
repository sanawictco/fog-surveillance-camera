import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import { NvrProps } from '../../domain/nvr/nvr.type';
import { LiveSignalStatuses } from '../../shared/valueObjects/liveSignalStatus.vo';

@Schema({ collection: 'nvrs' })
export class NvrModel implements NvrProps {
  @Prop({ unique: true, required: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  workstationId!: string;

  @Prop({ required: true })
  maxCameras!: number;

  @Prop({ required: true, unique: true })
  serialNumber!: string;

  @Prop({ unique: true, required: true })
  accessToken!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ required: true })
  lang!: LanguageCode;

  @Prop({ default: false, required: true })
  isActive!: boolean;

  @Prop({ required: true })
  liveSignalStatus!: LiveSignalStatuses;

  @Prop({ required: true })
  cloudFailedAt!: number;

  @Prop({ default: new Date() })
  createdAt!: Date;

  @Prop({ default: new Date() })
  updatedAt!: Date;

  @Prop({ type: Object, required: true })
  runningConfigs!: Record<string, string>;
}
export const NvrSchema = SchemaFactory.createForClass(NvrModel);
