import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import type { NvrProps } from '../../domain/nvr/nvr.type';
import { LiveSignalStatuses } from '../../shared/valueObjects/liveSignalStatus.vo';

@Schema({ collection: 'nvrs' })
export class NvrModel implements NvrProps {
  @Prop({ unique: true, required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true })
  maxCameras: number;

  @Prop({ required: true })
  productModel: string;

  @Prop({ required: true, unique: true })
  serialNumber: string;

  @Prop({ unique: true, required: true })
  accessToken: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, type: String, enum: LanguageCode })
  lang: LanguageCode;

  @Prop({ default: false, required: true })
  isActive: boolean;

  @Prop({ required: true, type: String, enum: LiveSignalStatuses })
  liveSignalStatus: LiveSignalStatuses;

  @Prop({ default: 0 })
  cloudFailedAt: number;

  @Prop({ default: new Date() })
  createdAt: Date;

  @Prop({ default: new Date() })
  updatedAt: Date;

  constructor(props?: NvrProps) {
    this.id = '';
    this.name = props?.name ?? '';
    this.tenantId = props?.tenantId ?? '';
    this.maxCameras = props?.maxCameras ?? 0;
    this.productModel = props?.productModel ?? '';
    this.serialNumber = props?.serialNumber ?? '';
    this.accessToken = props?.accessToken ?? '';
    this.password = props?.password ?? '';
    this.lang = props?.lang ?? LanguageCode.FA;
    this.isActive = props?.isActive ?? false;
    this.liveSignalStatus =
      props?.liveSignalStatus ?? LiveSignalStatuses.DIS_CONNECTED;
    this.cloudFailedAt = props?.cloudFailedAt ?? 0;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
}
export const NvrSchema = SchemaFactory.createForClass(NvrModel);
