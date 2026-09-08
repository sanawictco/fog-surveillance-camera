import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import AppConfig from 'configs/app.config';
import { buildSecurityHeader, OnvifCredentials } from './onvifSecurity';

export class OnvifFaultError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'OnvifFaultError';
  }
}

@Injectable()
export class OnvifSoapClient {
  // removeNSPrefix is mandatory: vendors vary SOAP prefixes freely, so every
  // lookup in this module matches on local name only.
  private readonly parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
  });

  async call(
    endpoint: string,
    bodyXml: string,
    options: {
      credentials?: OnvifCredentials;
      deviceTimeOffsetMs?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<Record<string, any>> {
    const header = options.credentials
      ? `<s:Header>${buildSecurityHeader(options.credentials, {
          deviceTimeOffsetMs: options.deviceTimeOffsetMs,
        })}</s:Header>`
      : '';
    const envelope =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">' +
      `${header}<s:Body>${bodyXml}</s:Body></s:Envelope>`;

    const response = await axios.post(endpoint, envelope, {
      headers: { 'content-type': 'application/soap+xml; charset=utf-8' },
      timeout: options.timeoutMs ?? AppConfig().onvif.requestTimeoutMs,
      responseType: 'text',
      transformResponse: [(data: string) => data],
      // A SOAP fault arrives with a 4xx/5xx status and a body worth parsing,
      // so every status is accepted here and classified below.
      validateStatus: () => true,
      maxRedirects: 0,
    });

    const parsed = this.parser.parse(response.data as string) as Record<string, any>;
    const body = parsed?.Envelope?.Body;
    if (!body || typeof body !== 'object') {
      throw new Error(`ONVIF response from ${endpoint} is not a SOAP envelope`);
    }
    if (body.Fault) {
      throw new OnvifFaultError(faultReason(body.Fault));
    }
    return body as Record<string, any>;
  }
}

function faultReason(fault: Record<string, any>): string {
  const text = fault?.Reason?.Text;
  if (typeof text === 'string' && text) return text;
  if (typeof text === 'object' && typeof text?.['#text'] === 'string') {
    return text['#text'];
  }
  if (typeof fault?.faultstring === 'string') return fault.faultstring;
  return 'unspecified ONVIF fault';
}
