import { Injectable } from '@nestjs/common';
import { createSocket } from 'node:dgram';
import { randomUUID } from 'node:crypto';
import { NetworkObservation } from './networkScanner.types';
import { assertIpv4 } from './cidr';

@Injectable()
export class OnvifDiscoveryService {
  discover(
    interfaceName: string,
    hostAddress: string,
    signal?: AbortSignal,
  ): Promise<NetworkObservation[]> {
    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const socket = createSocket({ type: 'udp4', reuseAddr: true });
      const observations = new Map<string, NetworkObservation>();
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        try {
          socket.close();
        } catch {
          // The socket may not have completed binding yet.
        }
        if (error) reject(error);
        else resolve([...observations.values()]);
      };
      const onAbort = () =>
        finish(signal?.reason ?? new Error('ONVIF discovery aborted'));
      const timer = setTimeout(() => {
        finish();
      }, 1500);
      signal?.addEventListener('abort', onAbort, { once: true });
      socket.once('error', finish);
      socket.on('message', (message) => {
        const matches = message
          .toString('utf8')
          .matchAll(/https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?\//g);
        for (const match of matches) {
          let ipAddress: string;
          try {
            ipAddress = assertIpv4(match[1] ?? '');
          } catch {
            continue;
          }
          observations.set(ipAddress, {
            ipAddress,
            interfaceName,
            evidence: 'onvif',
          });
        }
      });
      socket.bind(0, hostAddress, () => {
        try {
          socket.setMulticastInterface(hostAddress);
          const probe = Buffer.from(buildProbe(randomUUID()));
          socket.send(probe, 3702, '239.255.255.250', (error) => {
            if (error) finish(error);
          });
        } catch (error) {
          finish(error);
        }
      });
    });
  }
}

function buildProbe(id: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><e:Header><w:MessageID>uuid:${id}</w:MessageID><w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>`;
}
