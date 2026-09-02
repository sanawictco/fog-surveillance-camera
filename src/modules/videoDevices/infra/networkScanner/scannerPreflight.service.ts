import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import AppConfig from 'configs/app.config';

const CAP_NET_RAW_BIT = 13n;

@Injectable()
export class ScannerPreflightService implements OnApplicationBootstrap {
  async onApplicationBootstrap(): Promise<void> {
    if (AppConfig().environment !== 'production') return;
    if (process.platform !== 'linux') {
      throw new Error('camera scanner requires Linux');
    }
    if (process.getuid?.() === 0) {
      throw new Error('camera scanner application must not run as root');
    }
    await access(AppConfig().networkScanner.nmapExecutable, constants.X_OK);
    const status = await readFile('/proc/self/status', 'utf8');
    const effectiveCapabilities = /^CapEff:\s*([0-9a-f]+)$/im.exec(status)?.[1];
    if (!effectiveCapabilities) {
      throw new Error('cannot determine scanner process capabilities');
    }
    const capabilityMask = BigInt(`0x${effectiveCapabilities}`);
    if ((capabilityMask & (1n << CAP_NET_RAW_BIT)) === 0n) {
      throw new Error('camera scanner requires CAP_NET_RAW');
    }
  }
}
