import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { StreamsProps } from '../../domain/camera/valueObjects/streams.vo';

@Schema({ collection: 'discoveredCameras' })
export class DiscoveredCameraModel {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  nvrId!: string;

  @Prop()
  macAddress?: string;

  @Prop()
  endpointReference?: string;

  @Prop({ required: true })
  ipAddress!: string;

  @Prop({ required: true })
  interfaceName!: string;

  @Prop({ required: true })
  status!: string;

  @Prop({ type: [String], default: [] })
  discoveredVia!: string[];

  @Prop() manufacturer?: string;
  @Prop() model?: string;
  @Prop() firmwareVersion?: string;
  @Prop() serialNumber?: string;
  @Prop() hardwareId?: string;
  @Prop() onvifXaddr?: string;
  @Prop() suggestedName?: string;
  @Prop() hasPtz?: boolean;
  @Prop() hasAudio?: boolean;
  @Prop() multiHomed?: boolean;

  @Prop({ type: StreamsProps })
  streams?: StreamsProps;

  @Prop({ type: [String], default: [] })
  conflictMacAddresses!: string[];

  @Prop({ type: [String], default: [] })
  conflictEndpointReferences!: string[];

  @Prop({ required: true })
  lastSeenAt!: Date;
}

export const DiscoveredCameraSchema = SchemaFactory.createForClass(
  DiscoveredCameraModel,
);
// Sparse: a colliding device has no resolvable MAC and is keyed by endpoint
// reference instead, so several such records legitimately have no macAddress.
DiscoveredCameraSchema.index(
  { tenantId: 1, nvrId: 1, macAddress: 1 },
  { unique: true, sparse: true },
);
DiscoveredCameraSchema.index(
  { tenantId: 1, nvrId: 1, endpointReference: 1 },
  { unique: true, sparse: true },
);
