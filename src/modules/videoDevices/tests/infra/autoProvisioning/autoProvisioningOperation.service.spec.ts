import {
  AutoProvisioningOperationModel,
  AutoProvisioningOperationSchema,
} from '../../../infra/autoProvisioning/autoProvisioningOperation.schema';
import { AutoProvisioningOperationService } from '../../../infra/autoProvisioning/autoProvisioningOperation.service';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ tenantId: 'tenant-id', nvrId: 'nvr-id' }),
}));

describe('AutoProvisioningOperationService', () => {
  it('replays a durably stored terminal acknowledgement', async () => {
    const acknowledgement = { msgId: '000123', macAddresses: [] };
    const model = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          status: 'SUCCEEDED',
          acknowledgement,
        } as Partial<AutoProvisioningOperationModel>),
      }),
    };
    const service = new AutoProvisioningOperationService(model as never);

    await expect(service.findReplay('000123')).resolves.toEqual(
      acknowledgement,
    );
  });

  it('declares one durable operation per tenant, NVR, and msgId', () => {
    expect(AutoProvisioningOperationSchema.indexes()).toContainEqual([
      { tenantId: 1, nvrId: 1, msgId: 1 },
      { unique: true },
    ]);
  });

  it('allows lifecycle operation types in the durable ledger', () => {
    const configType = AutoProvisioningOperationSchema.path('configType');

    expect(configType.options.enum).toEqual(
      expect.arrayContaining(['update', 'delete', 'active', 'inactive']),
    );
  });

  it('requires the current claim token to complete an operation', async () => {
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    const service = new AutoProvisioningOperationService({
      updateOne,
    } as never);

    await expect(
      service.succeed('msg-id', 'stale-claim', { msgId: 'msg-id' }),
    ).rejects.toThrow('operation lease was lost');
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken: 'stale-claim' }),
      expect.any(Object),
    );
  });
});
