import { Injectable } from '@nestjs/common';
import { NetworkProcessRunner } from './networkProcess.runner';
import { normalizeMacAddress, assertIpv4 } from './cidr';
import { NetworkObservation } from './networkScanner.types';

@Injectable()
export class PassiveNeighborService {
  constructor(private readonly processRunner: NetworkProcessRunner) {}

  async read(
    interfaceName: string,
    signal?: AbortSignal,
  ): Promise<NetworkObservation[]> {
    const result = await this.processRunner.run(
      '/sbin/ip',
      ['-j', 'neigh', 'show', 'dev', interfaceName],
      5_000,
      1024 * 1024,
      signal,
    );
    const rows = JSON.parse(result.stdout) as Array<{
      dst?: string;
      lladdr?: string;
      state?: string[];
    }>;
    return rows
      .filter(
        (row) =>
          row.dst &&
          row.lladdr &&
          !row.state?.some((state) => ['FAILED', 'INCOMPLETE'].includes(state)),
      )
      .map((row) => ({
        ipAddress: assertIpv4(row.dst!),
        macAddress: normalizeMacAddress(row.lladdr!),
        interfaceName,
        evidence: 'neighbor' as const,
      }));
  }
}
