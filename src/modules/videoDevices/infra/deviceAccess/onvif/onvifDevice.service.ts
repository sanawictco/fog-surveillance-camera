import { Injectable } from '@nestjs/common';
import { normalizeMacAddress } from '../../networkScanner/cidr';
import { OnvifSoapClient } from './onvifSoap.client';
import { OnvifCredentials } from './onvifSecurity';
import {
  OnvifDeviceInformation,
  OnvifEndpoint,
  OnvifService,
} from './onvif.types';

const DEVICE_NS = 'http://www.onvif.org/ver10/device/wsdl';

@Injectable()
export class OnvifDeviceService {
  constructor(private readonly soap: OnvifSoapClient) {}

  async getDeviceInformation(
    endpoint: OnvifEndpoint,
    credentials: OnvifCredentials,
  ): Promise<OnvifDeviceInformation> {
    const body = await this.request(
      endpoint,
      credentials,
      `<GetDeviceInformation xmlns="${DEVICE_NS}"/>`,
    );
    const response = body?.GetDeviceInformationResponse ?? {};
    return {
      manufacturer: text(response.Manufacturer),
      model: text(response.Model),
      firmwareVersion: text(response.FirmwareVersion),
      serialNumber: text(response.SerialNumber),
      hardwareId: text(response.HardwareId),
    };
  }

  async getServices(
    endpoint: OnvifEndpoint,
    credentials: OnvifCredentials,
  ): Promise<OnvifService[]> {
    const body = await this.request(
      endpoint,
      credentials,
      `<GetServices xmlns="${DEVICE_NS}"><IncludeCapability>false</IncludeCapability></GetServices>`,
    );
    return asArray(body?.GetServicesResponse?.Service)
      .map((service) => ({
        namespace: text(service?.Namespace) ?? '',
        xaddr: text(service?.XAddr) ?? '',
      }))
      .filter((service) => service.namespace && service.xaddr);
  }

  async getMacAddress(
    endpoint: OnvifEndpoint,
    credentials: OnvifCredentials,
  ): Promise<string | undefined> {
    const body = await this.request(
      endpoint,
      credentials,
      `<GetNetworkInterfaces xmlns="${DEVICE_NS}"/>`,
    );
    for (const item of asArray(body?.GetNetworkInterfacesResponse?.NetworkInterfaces)) {
      const raw = text(item?.Info?.HwAddress);
      if (!raw) continue;
      try {
        const normalized = normalizeMacAddress(raw);
        // Skip placeholder addresses that are common on disabled/virtual interfaces
        if (normalized === '00:00:00:00:00:00' || normalized === 'FF:FF:FF:FF:FF:FF') {
          continue;
        }
        return normalized;
      } catch {
        // Some devices report a placeholder here; keep looking.
      }
    }
    return undefined;
  }

  private request(
    endpoint: OnvifEndpoint,
    credentials: OnvifCredentials,
    bodyXml: string,
  ): Promise<Record<string, any>> {
    return this.soap.call(endpoint.xaddr, bodyXml, {
      credentials,
      deviceTimeOffsetMs: endpoint.deviceTimeOffsetMs,
    });
  }
}

export function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && typeof (value as any)['#text'] === 'string') {
    return (value as any)['#text'] || undefined;
  }
  return undefined;
}
