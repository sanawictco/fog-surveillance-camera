import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { FogVideoDeviceConfigType } from 'src/modules/shared/cloudConfig/cloudConfigClient.service';

export type AutoProvisioningOperationStatus =
  'PROCESSING' | 'SUCCEEDED' | 'FAILED';

@Schema({ collection: 'autoProvisioningOperations', timestamps: true })
export class AutoProvisioningOperationModel {
  @Prop({ required: true })
  tenantId!: string;

  @Prop({ required: true })
  nvrId!: string;

  @Prop({ required: true })
  msgId!: string;

  @Prop({
    type: String,
    required: true,
    enum: [
      'search',
      'register',
      'update',
      'delete',
      'active',
      'inactive',
      'fogLiveSignal',
    ],
  })
  configType!: FogVideoDeviceConfigType;

  @Prop({ required: true, enum: ['PROCESSING', 'SUCCEEDED', 'FAILED'] })
  status!: AutoProvisioningOperationStatus;

  @Prop({ required: true, default: 1 })
  attemptCount!: number;

  @Prop({ required: true })
  lockedUntil!: Date;

  @Prop({ required: true })
  claimToken!: string;

  @Prop({ type: Object })
  acknowledgement?: object;

  @Prop()
  safeErrorCode?: string;

  @Prop()
  completedAt?: Date;
}

export const AutoProvisioningOperationSchema = SchemaFactory.createForClass(
  AutoProvisioningOperationModel,
);
AutoProvisioningOperationSchema.index(
  { tenantId: 1, nvrId: 1, msgId: 1 },
  { unique: true },
);
