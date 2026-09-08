import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import AppConfig from 'configs/app.config';
import { DiscoveredCameraModel } from './discoveredCamera.schema';
import { DiscoveredCamera } from './discoveredCamera.types';

@Injectable()
export class DiscoveredCameraRepository {
  constructor(
    @InjectModel(DiscoveredCameraModel.name)
    private readonly model: Model<DiscoveredCameraModel>,
  ) {}

  async upsertMany(cameras: DiscoveredCamera[]): Promise<void> {
    for (const camera of cameras) {
      const key = this.identityFilter(camera);
      if (!key) continue;
      await this.model.updateOne(
        key,
        { $set: { ...camera, ...key, lastSeenAt: new Date() } },
        { upsert: true },
      );
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
  ): Record<string, string> | undefined {
    if (camera.macAddress) {
      return { ...this.scope(), macAddress: camera.macAddress };
    }
    if (camera.endpointReference) {
      return { ...this.scope(), endpointReference: camera.endpointReference };
    }
    // Nothing stable to key on; a record we could never resolve later is worse
    // than no record.
    return undefined;
  }

  private scope(): { tenantId: string; nvrId: string } {
    return { tenantId: AppConfig().tenantId, nvrId: AppConfig().nvrId };
  }
}
