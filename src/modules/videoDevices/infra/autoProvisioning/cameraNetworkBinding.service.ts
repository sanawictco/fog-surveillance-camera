import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import AppConfig from 'configs/app.config';
import { CameraNetworkObservation } from '../networkScanner/networkScanner.types';
import { CameraNetworkBindingModel } from './cameraNetworkBinding.schema';

@Injectable()
export class CameraNetworkBindingService {
  constructor(
    @InjectModel(CameraNetworkBindingModel.name)
    private readonly model: Model<CameraNetworkBindingModel>,
  ) {}

  async refresh(
    observations: CameraNetworkObservation[],
    signal?: AbortSignal,
  ): Promise<void> {
    const scope = { tenantId: AppConfig().tenantId, nvrId: AppConfig().nvrId };
    const now = new Date();
    for (const observation of observations) {
      signal?.throwIfAborted();
      await this.model.updateOne(
        { ...scope, macAddress: observation.macAddress },
        {
          $set: {
            ipAddress: observation.ipAddress,
            interfaceName: observation.interfaceName,
            stale: false,
            lastSeenAt: now,
          },
          $setOnInsert: scope,
        },
        { upsert: true },
      );
    }
    await this.model.updateMany(
      {
        ...scope,
        macAddress: { $nin: observations.map((item) => item.macAddress) },
      },
      { $set: { stale: true } },
    );
    signal?.throwIfAborted();
  }

  async resolveFresh(macAddress: string): Promise<CameraNetworkBindingModel | null> {
    return this.model
      .findOne({
        tenantId: AppConfig().tenantId,
        nvrId: AppConfig().nvrId,
        macAddress,
        stale: false,
      })
      .lean();
  }

  async markAllStale(): Promise<void> {
    await this.model.updateMany(
      { tenantId: AppConfig().tenantId, nvrId: AppConfig().nvrId },
      { $set: { stale: true } },
    );
  }

  async bindCamera(macAddress: string, serialNumber: string): Promise<void> {
    await this.model.updateOne(
      {
        tenantId: AppConfig().tenantId,
        nvrId: AppConfig().nvrId,
        macAddress,
        stale: false,
      },
      { $set: { cameraSerialNumber: serialNumber } },
    );
  }
}
