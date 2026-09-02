import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { assertIpv4 } from '../networkScanner/cidr';

@Schema({ collection: 'cameraNetworkBindings', timestamps: true })
export class CameraNetworkBindingModel {
  @Prop({ required: true })
  tenantId!: string;

  @Prop({ required: true })
  nvrId!: string;

  @Prop({ required: true })
  macAddress!: string;

  @Prop({
    required: true,
    validate: {
      validator: (value: string) => {
        try {
          assertIpv4(value);
          return true;
        } catch {
          return false;
        }
      },
      message: 'ipAddress must be IPv4',
    },
  })
  ipAddress!: string;

  @Prop({ required: true })
  interfaceName!: string;

  @Prop({ required: true, default: false })
  stale!: boolean;

  @Prop({ required: true })
  lastSeenAt!: Date;

  @Prop()
  cameraSerialNumber?: string;
}

export const CameraNetworkBindingSchema = SchemaFactory.createForClass(
  CameraNetworkBindingModel,
);
CameraNetworkBindingSchema.index(
  { tenantId: 1, nvrId: 1, macAddress: 1 },
  { unique: true },
);
CameraNetworkBindingSchema.index({ tenantId: 1, nvrId: 1, ipAddress: 1 });
