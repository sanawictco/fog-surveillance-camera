import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import AppConfig from 'configs/app.config';
import { DiscoveredCameraModel } from './discoveredCamera.schema';
import { DiscoveredCamera } from './discoveredCamera.types';

@Injectable()
export class DiscoveredCameraRepository {
  private readonly logger = new Logger(DiscoveredCameraRepository.name);

  constructor(
    @InjectModel(DiscoveredCameraModel.name)
    private readonly model: Model<DiscoveredCameraModel>,
  ) {}

  async upsertMany(cameras: DiscoveredCamera[]): Promise<void> {
    for (const camera of cameras) {
      const filter = this.identityFilter(camera);
      if (!filter) continue;
      try {
        await this.model.updateOne(
          filter,
          { $set: { ...camera, ...this.scope(), lastSeenAt: new Date() } },
          { upsert: true },
        );
      } catch (error) {
        const identity = camera.macAddress || camera.endpointReference;
        this.logger.error(
          `Failed to upsert camera ${identity}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async findAllFresh(): Promise<DiscoveredCamera[]> {
    const since = new Date(
      Date.now() - AppConfig().onvif.discoveryTtlMinutes * 60_000,
    );
    return (await this.model
      .find({ ...this.scope(), lastSeenAt: { $gte: since } })
      .lean()) as unknown as DiscoveredCamera[];
  }

  private identityFilter(
    camera: DiscoveredCamera,
  ): Record<string, unknown> | undefined {
    const { macAddress, endpointReference } = camera;
    if (macAddress && endpointReference) {
      // The camera may have first been cached keyed by endpoint reference
      // (before its MAC was known) and now also carries a MAC. Match on
      // either scoped key so that earlier row is updated in place — a
      // MAC-only filter would match nothing and the upsert would insert a
      // second document sharing the same endpointReference, violating the
      // unique partial index on it.
      return {
        $or: [
          { ...this.scope(), macAddress },
          { ...this.scope(), endpointReference },
        ],
      };
    }
    if (macAddress) {
      return { ...this.scope(), macAddress };
    }
    if (endpointReference) {
      return { ...this.scope(), endpointReference };
    }
    // Nothing stable to key on; a record we could never resolve later is worse
    // than no record.
    return undefined;
  }

  private scope(): { tenantId: string; nvrId: string } {
    return { tenantId: AppConfig().tenantId, nvrId: AppConfig().nvrId };
  }
}
