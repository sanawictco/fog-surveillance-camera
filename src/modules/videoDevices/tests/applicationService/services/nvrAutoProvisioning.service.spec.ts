import { NvrAutoProvisioningService } from '../../../applicationService/services/nvrAutoProvisioning.service';
import { ActiveNvrCommand } from '../../../applicationService/commands/nvr/activeNvr.command';
import { InActiveNvrCommand } from '../../../applicationService/commands/nvr/inactiveNvr.command';
import { DeleteNvrCommand } from '../../../applicationService/commands/nvr/deleteNvr.command';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ tenantId: 'tenant-id', nvrId: 'nvr-id' }),
}));

describe('NvrAutoProvisioningService', () => {
  it('retains previous bindings as stale when scanning fails', async () => {
    const bindings = {
      markAllStale: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn(),
    };
    const operations = {
      findReplay: jest.fn().mockResolvedValue(undefined),
      claim: jest.fn().mockResolvedValue({
        kind: 'CLAIMED',
        operation: { claimToken: 'claim-token' },
      }),
      fail: jest.fn(),
      renew: jest.fn().mockResolvedValue(true),
    };
    const service = new NvrAutoProvisioningService(
      {} as never,
      {
        fetch: jest.fn().mockResolvedValue({ configType: 'search', data: {} }),
      } as never,
      {
        scan: jest.fn().mockRejectedValue(new Error('scanner failed')),
      } as never,
      bindings as never,
      operations as never,
      { publish: jest.fn() } as never,
    );

    await expect(service.process('search-msg')).rejects.toThrow(
      'scanner failed',
    );
    expect(bindings.markAllStale).toHaveBeenCalledTimes(1);
    expect(bindings.refresh).not.toHaveBeenCalled();
    expect(operations.fail).toHaveBeenCalledWith(
      'search-msg',
      'claim-token',
      'OPERATION_FAILED',
    );
  });

  it('replays a stored acknowledgement without fetching or reprocessing', async () => {
    const acknowledgement = { msgId: 'search-msg', macAddresses: [] };
    const cloudConfig = { fetch: jest.fn() };
    const scanner = { scan: jest.fn() };
    const operations = {
      findReplay: jest.fn().mockResolvedValue(acknowledgement),
      claim: jest.fn(),
    };
    const mqtt = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new NvrAutoProvisioningService(
      {} as never,
      cloudConfig as never,
      scanner as never,
      {} as never,
      operations as never,
      mqtt as never,
    );

    await service.process('search-msg');

    expect(mqtt.publish).toHaveBeenCalledWith(
      'tenants/tenant-id/nvrs/nvr-id/config/to-cloud',
      acknowledgement,
      2,
      true,
    );
    expect(cloudConfig.fetch).not.toHaveBeenCalled();
    expect(operations.claim).not.toHaveBeenCalled();
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('durably processes an NVR update before publishing acknowledgement', async () => {
    const serviceProvider = {
      commandBus: { execute: jest.fn().mockResolvedValue('nvr-id') },
    };
    const operations = {
      findReplay: jest.fn().mockResolvedValue(undefined),
      claim: jest.fn().mockResolvedValue({
        kind: 'CLAIMED',
        operation: { claimToken: 'claim-token' },
      }),
      renew: jest.fn().mockResolvedValue(true),
      succeed: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn(),
    };
    const mqtt = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new NvrAutoProvisioningService(
      serviceProvider as never,
      {
        fetch: jest.fn().mockResolvedValue({
          configType: 'update',
          data: { id: 'nvr-id', name: 'Updated NVR' },
        }),
      } as never,
      {} as never,
      {} as never,
      operations as never,
      mqtt as never,
    );

    await service.process('update-msg');

    expect(serviceProvider.commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'nvr-id', name: 'Updated NVR' }),
    );
    expect(operations.succeed).toHaveBeenCalledWith(
      'update-msg',
      'claim-token',
      { msgId: 'update-msg' },
    );
    expect(mqtt.publish).toHaveBeenCalledWith(
      'tenants/tenant-id/nvrs/nvr-id/config/to-cloud',
      { msgId: 'update-msg' },
      2,
      true,
    );
  });

  it.each([
    ['active', ActiveNvrCommand],
    ['inactive', InActiveNvrCommand],
    ['delete', DeleteNvrCommand],
  ] as const)(
    'durably processes an NVR %s before publishing acknowledgement',
    async (configType, CommandType) => {
      const serviceProvider = {
        commandBus: { execute: jest.fn().mockResolvedValue('nvr-id') },
        queryBus: { execute: jest.fn().mockResolvedValue({ id: 'nvr-id' }) },
      };
      const operations = {
        findReplay: jest.fn().mockResolvedValue(undefined),
        claim: jest.fn().mockResolvedValue({
          kind: 'CLAIMED',
          operation: { claimToken: 'claim-token' },
        }),
        renew: jest.fn().mockResolvedValue(true),
        succeed: jest.fn().mockResolvedValue(undefined),
        fail: jest.fn(),
      };
      const mqtt = { publish: jest.fn().mockResolvedValue(undefined) };
      const service = new NvrAutoProvisioningService(
        serviceProvider as never,
        {
          fetch: jest.fn().mockResolvedValue({
            configType,
            data: { id: 'nvr-id' },
          }),
        } as never,
        {} as never,
        {} as never,
        operations as never,
        mqtt as never,
      );

      await service.process(`${configType}-msg`);

      expect(serviceProvider.commandBus.execute).toHaveBeenCalledWith(
        expect.any(CommandType),
      );
      expect(operations.succeed).toHaveBeenCalledWith(
        `${configType}-msg`,
        'claim-token',
        { msgId: `${configType}-msg` },
      );
      expect(mqtt.publish).toHaveBeenCalledWith(
        'tenants/tenant-id/nvrs/nvr-id/config/to-cloud',
        { msgId: `${configType}-msg` },
        2,
        true,
      );
    },
  );

  it('treats an already deleted local NVR as a successful retry', async () => {
    const serviceProvider = {
      commandBus: { execute: jest.fn() },
      queryBus: { execute: jest.fn().mockResolvedValue(undefined) },
    };
    const operations = {
      findReplay: jest.fn().mockResolvedValue(undefined),
      claim: jest.fn().mockResolvedValue({
        kind: 'CLAIMED',
        operation: { claimToken: 'claim-token' },
      }),
      renew: jest.fn().mockResolvedValue(true),
      succeed: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn(),
    };
    const mqtt = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new NvrAutoProvisioningService(
      serviceProvider as never,
      {
        fetch: jest.fn().mockResolvedValue({
          configType: 'delete',
          data: { id: 'nvr-id' },
        }),
      } as never,
      {} as never,
      {} as never,
      operations as never,
      mqtt as never,
    );

    await service.process('delete-msg');

    expect(serviceProvider.commandBus.execute).not.toHaveBeenCalled();
    expect(operations.succeed).toHaveBeenCalledWith(
      'delete-msg',
      'claim-token',
      { msgId: 'delete-msg' },
    );
    expect(mqtt.publish).toHaveBeenCalledWith(
      'tenants/tenant-id/nvrs/nvr-id/config/to-cloud',
      { msgId: 'delete-msg' },
      2,
      true,
    );
  });
});
