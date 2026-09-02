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

export interface NetworkObservation {
  ipAddress: string;
  macAddress?: string;
  interfaceName: string;
  evidence: 'neighbor' | 'onvif' | 'nmap';
}

export interface CameraNetworkObservation {
  ipAddress: string;
  macAddress: string;
  interfaceName: string;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
}
