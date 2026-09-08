export interface PhysicalEthernetNetwork {
  interfaceName: string;
  hostAddress: string;
  netmask: string;
  cidr: string;
  prefixLength: number;
  networkAddress: string;
  broadcastAddress: string;
  hostCount: number;
}

export type DiscoveryEvidence = 'lease' | 'neighbor' | 'onvif' | 'nmap';

export interface NetworkObservation {
  ipAddress: string;
  macAddress?: string;
  interfaceName: string;
  evidence: DiscoveryEvidence;
  hostname?: string;
  endpointReference?: string;
  onvifXaddr?: string;
  scopes?: string[];
}

export type DiscoveredCameraStatus =
  | 'ONVIF_READY'
  | 'AUTH_FAILED'
  | 'ONVIF_UNREACHABLE'
  | 'IP_CONFLICT';

export interface MergedObservation {
  ipAddress: string;
  macAddress?: string;
  interfaceName: string;
  evidence: DiscoveryEvidence[];
  hostname?: string;
  endpointReference?: string;
  onvifXaddr?: string;
  scopes?: string[];
  // A device answering on two addresses is an anomaly worth surfacing, but it
  // is still probeable — so it is a flag, not a terminal status.
  multiHomed?: boolean;
  conflictMacAddresses?: string[];
  conflictEndpointReferences?: string[];
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
}
