export interface OnvifEndpoint {
  xaddr: string;
  deviceTimeOffsetMs: number;
}

export interface OnvifDeviceInformation {
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
}

export interface OnvifService {
  namespace: string;
  xaddr: string;
}

export interface OnvifResolution {
  width: number;
  height: number;
}

export interface OnvifProfile {
  token: string;
  name?: string;
  resolution?: OnvifResolution;
  hasAudio: boolean;
  hasPtz: boolean;
  streamUri?: string;
}
