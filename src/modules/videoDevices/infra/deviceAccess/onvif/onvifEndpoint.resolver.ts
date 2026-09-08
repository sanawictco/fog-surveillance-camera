import { Injectable } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { OnvifSoapClient } from './onvifSoap.client';
import { OnvifEndpoint } from './onvif.types';

const GET_SYSTEM_DATE_AND_TIME =
  '<GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>';

@Injectable()
export class OnvifEndpointResolver {
  constructor(private readonly soap: OnvifSoapClient) {}

  async resolve(
    ipAddress: string,
    knownXaddr?: string,
  ): Promise<OnvifEndpoint | undefined> {
    const candidates = knownXaddr
      ? [knownXaddr]
      : AppConfig().onvif.candidatePorts.map(
          (port: number) =>
            `http://${ipAddress}:${port}/onvif/device_service`.replace(':80/', '/'),
        );
    for (const xaddr of candidates) {
      try {
        // Unauthenticated by ONVIF spec: proves the endpoint and yields the
        // device clock needed to build a valid Created timestamp later.
        const body = await this.soap.call(xaddr, GET_SYSTEM_DATE_AND_TIME);
        const deviceTime = readUtcDateTime(body);
        if (deviceTime === undefined) continue;
        return { xaddr, deviceTimeOffsetMs: deviceTime - Date.now() };
      } catch {
        // Try the next candidate; an unreachable port is expected.
      }
    }
    return undefined;
  }
}

function readUtcDateTime(body: Record<string, any>): number | undefined {
  const utc =
    body?.GetSystemDateAndTimeResponse?.SystemDateAndTime?.UTCDateTime;
  const date = utc?.Date;
  const time = utc?.Time;
  if (!date || !time) return undefined;
  const value = Date.UTC(
    Number(date.Year),
    Number(date.Month) - 1,
    Number(date.Day),
    Number(time.Hour),
    Number(time.Minute),
    Number(time.Second ?? 0),
  );
  return Number.isNaN(value) ? undefined : value;
}
