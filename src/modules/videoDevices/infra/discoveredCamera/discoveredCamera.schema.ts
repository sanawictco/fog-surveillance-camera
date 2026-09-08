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
// Partial indexes: enforce uniqueness only when the indexed field exists.
// A camera without macAddress (e.g., non-ONVIF or WS-Discovery collision) has no MAC key,
// so multiple such records must coexist. Compound indexes with required fields (tenantId, nvrId)
// are sparse: true only when ALL indexed fields are sparse; since we have required fields,
// we instead use partialFilterExpression to skip documents lacking the identity field.
DiscoveredCameraSchema.index(
  { tenantId: 1, nvrId: 1, macAddress: 1 },
  { unique: true, partialFilterExpression: { macAddress: { $exists: true } } },
);
DiscoveredCameraSchema.index(
  { tenantId: 1, nvrId: 1, endpointReference: 1 },
  { unique: true, partialFilterExpression: { endpointReference: { $exists: true } } },
);
