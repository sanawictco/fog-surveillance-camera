import { Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { CameraNetworkScannerService } from '../../../infra/networkScanner/cameraNetworkScanner.service';
import { DiscoveredCameraRepository } from '../../../infra/discoveredCamera/discoveredCamera.repository';
import { DiscoveredCamera } from '../../../infra/discoveredCamera/discoveredCamera.types';
import { OnvifCapabilityProbe } from './onvifCapabilityProbe.service';

@Injectable()
export class CameraDiscoveryService {
  constructor(
    private readonly scanner: CameraNetworkScannerService,
    private readonly probe: OnvifCapabilityProbe,
    private readonly repository: DiscoveredCameraRepository,
    private readonly serviceProvider: ServiceProvider,
  ) {}

  async discover(signal?: AbortSignal): Promise<DiscoveredCamera[]> {
    const observations = await this.scanner.scan(signal);
    const cameras: DiscoveredCamera[] = [];
    for (const observation of observations) {
      signal?.throwIfAborted();
      try {
        cameras.push(await this.probe.probe(observation));
      } catch (error) {
        // The probe is written not to throw; if it ever does, one bad device
        // must not cost the whole inventory.
        this.serviceProvider.logger.error(
          'camera discovery: probe failed unexpectedly',
          error,
          { ipAddress: observation.ipAddress },
        );
      }
    }
    await this.repository.upsertMany(cameras);
    return cameras;
  }
}
