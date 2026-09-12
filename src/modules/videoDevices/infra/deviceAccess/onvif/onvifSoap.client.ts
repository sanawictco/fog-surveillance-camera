import { Injectable } from '@nestjs/common';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import axios from 'axios';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
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
  // Node's global agent has keepAlive: true by default since Node 19. ONVIF
  // devices routinely close the TCP connection after answering, so a pooled
  // socket is already dead when the next call reuses it and the request fails
  // with "socket hang up". Observed on an IPC6515F-K: every SECOND request
  // failed, and the credential loop misread that as a wrong password. A
  // `Connection: close` request header does not prevent it — only not pooling.
  private readonly httpAgent = new HttpAgent({ keepAlive: false });
  private readonly httpsAgent = new HttpsAgent({ keepAlive: false });

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
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
    });

    const raw = response.data as string;
    const validation = XMLValidator.validate(raw);
    if (validation !== true) {
      throw new Error(`ONVIF response from ${endpoint} is not a SOAP envelope`);
    }
    let parsed: Record<string, any>;
    try {
      parsed = this.parser.parse(raw) as Record<string, any>;
    } catch {
      throw new Error(`ONVIF response from ${endpoint} is not a SOAP envelope`);
    }
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
  // SOAP 1.2 allows multiple Reason/Text elements (one per xml:lang); when
  // more than one is present, fast-xml-parser yields an array. Use the
  // first entry's text rather than discarding the reason entirely.
  const first = Array.isArray(text) ? text[0] : text;
  if (typeof first === 'string' && first) return first;
  if (typeof first === 'object' && typeof first?.['#text'] === 'string') {
    return first['#text'];
  }
  if (typeof fault?.faultstring === 'string') return fault.faultstring;
  return 'unspecified ONVIF fault';
}
