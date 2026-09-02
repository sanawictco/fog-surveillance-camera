import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import AppConfig from 'configs/app.config';
import { randomUUID } from 'node:crypto';
import { AutoProvisioningOperationModel } from './autoProvisioningOperation.schema';
import type { FogVideoDeviceConfigType } from 'src/modules/shared/cloudConfig/cloudConfigClient.service';

export type OperationClaim =
  | { kind: 'CLAIMED'; operation: AutoProvisioningOperationModel }
  | { kind: 'REPLAY'; acknowledgement: object }
  | { kind: 'BUSY' };

@Injectable()
export class AutoProvisioningOperationService {
  constructor(
    @InjectModel(AutoProvisioningOperationModel.name)
    private readonly model: Model<AutoProvisioningOperationModel>,
  ) {}

  async findReplay(msgId: string): Promise<object | undefined> {
    const operation = await this.model.findOne(this.key(msgId)).lean();
    if (operation?.status === 'SUCCEEDED' && operation.acknowledgement) {
      return operation.acknowledgement;
    }
    return undefined;
  }

  async claim(
    msgId: string,
    configType: FogVideoDeviceConfigType,
  ): Promise<OperationClaim> {
    const key = {
      tenantId: AppConfig().tenantId,
      nvrId: AppConfig().nvrId,
      msgId,
    };
    const existing = await this.model.findOne(key).lean();
    if (existing?.status === 'SUCCEEDED' && existing.acknowledgement) {
      return { kind: 'REPLAY', acknowledgement: existing.acknowledgement };
    }
    if (
      existing?.status === 'PROCESSING' &&
      existing.lockedUntil.getTime() > Date.now()
    ) {
      return { kind: 'BUSY' };
    }
    if (existing && existing.configType !== configType) {
      throw new Error('message id was reused for another configuration type');
    }

    const lockedUntil = new Date(Date.now() + 180_000);
    const claimToken = randomUUID();
    try {
      const operation = await this.model.findOneAndUpdate(
        {
          ...key,
          $or: [
            { status: 'FAILED' },
            { status: 'PROCESSING', lockedUntil: { $lte: new Date() } },
            { status: { $exists: false } },
          ],
        },
        {
          $set: {
            configType,
            status: 'PROCESSING',
            lockedUntil,
            claimToken,
            safeErrorCode: null,
          },
          $setOnInsert: key,
          $inc: { attemptCount: 1 },
        },
        { upsert: !existing, new: true },
      );
      if (!operation) return { kind: 'BUSY' };
      return { kind: 'CLAIMED', operation: operation.toObject() };
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return { kind: 'BUSY' };
      throw error;
    }
  }

  async renew(msgId: string, claimToken: string): Promise<boolean> {
    const result = await this.model.updateOne(
      { ...this.key(msgId), status: 'PROCESSING', claimToken },
      { $set: { lockedUntil: new Date(Date.now() + 180_000) } },
    );
    return result.modifiedCount === 1;
  }

  async succeed(
    msgId: string,
    claimToken: string,
    acknowledgement: object,
  ): Promise<void> {
    const result = await this.model.updateOne(
      { ...this.key(msgId), status: 'PROCESSING', claimToken },
      {
        $set: {
          status: 'SUCCEEDED',
          acknowledgement,
          completedAt: new Date(),
        },
      },
    );
    if (result.modifiedCount !== 1) {
      throw new Error('auto-provisioning operation lease was lost');
    }
  }

  async fail(
    msgId: string,
    claimToken: string,
    safeErrorCode: string,
  ): Promise<void> {
    await this.model.updateOne(
      { ...this.key(msgId), status: 'PROCESSING', claimToken },
      {
        $set: { status: 'FAILED', safeErrorCode, lockedUntil: new Date() },
      },
    );
  }

  private key(msgId: string) {
    return {
      tenantId: AppConfig().tenantId,
      nvrId: AppConfig().nvrId,
      msgId,
    };
  }
}
