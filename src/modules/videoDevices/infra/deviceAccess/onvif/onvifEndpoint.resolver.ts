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
        if (deviceTime === undefined) {
          // The call succeeded — this proves the endpoint IS a live ONVIF
          // service — but its UTCDateTime shape could not be parsed. Losing
          // a reachable camera from the inventory is worse than shipping it
          // with an unadjusted clock.
          return { xaddr, deviceTimeOffsetMs: 0 };
        }
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
    toNumber(date.Year),
    toNumber(date.Month) - 1,
    toNumber(date.Day),
    toNumber(time.Hour),
    toNumber(time.Minute),
    toNumber(time.Second ?? 0),
  );
  return Number.isNaN(value) ? undefined : value;
}

// fast-xml-parser yields `{'#text': ..., <attr>: ...}` instead of a plain
// scalar for a leaf element that carries an attribute (e.g. a TZ attribute
// on Year). Unwrap that shape before coercing to a number.
function toNumber(value: unknown): number {
  if (
    value !== null &&
    typeof value === 'object' &&
    '#text' in (value as Record<string, unknown>)
  ) {
    return Number((value as Record<string, unknown>)['#text']);
  }
  return Number(value);
}
