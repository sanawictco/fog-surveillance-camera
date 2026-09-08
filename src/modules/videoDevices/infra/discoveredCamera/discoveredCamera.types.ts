import { StreamsProps } from '../../domain/camera/valueObjects/streams.vo';
import {
  DiscoveredCameraStatus,
  DiscoveryEvidence,
} from '../networkScanner/networkScanner.types';

export interface DiscoveredCamera {
  macAddress?: string;
  endpointReference?: string;
  ipAddress: string;
  interfaceName: string;
  status: DiscoveredCameraStatus;
  discoveredVia: DiscoveryEvidence[];
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
