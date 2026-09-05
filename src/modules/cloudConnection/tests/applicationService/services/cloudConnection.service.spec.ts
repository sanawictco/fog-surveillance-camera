import { CloudConnectionService } from '../../../applicationService/services/cloudConnection.service';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ nvrId: 'nvr-1', cloudHttpUrl: 'https://cloud.example.test' }),
}));

jest.mock('dns', () => ({
  promises: { lookup: jest.fn().mockResolvedValue(undefined) },
}));

describe('CloudConnectionService offline detection', () => {
  it('marks the NVR offline on missed heartbeat even when DNS resolves and MQTT reconnect succeeds', async () => {
    // This is the exact scenario the bug gets wrong: mqttReconnect() always
    // resolves (it swallows its own errors internally), and DNS resolving
    // only proves the internet is up, not that cloud's EMQX is reachable —
    // so the offline transition must not be gated behind either of these.
    CloudConnectionService.CLOUD_AVAILABILITY_QUEUE.length = 0;
    CloudConnectionService.CLOUD_AVAILABILITY_QUEUE.push(true, true); // exceed threshold
    CloudConnectionService.CLOUD_IS_AVAILABLE = true;

    const commandBus = { execute: jest.fn().mockResolvedValue(undefined) };
    const queryBus = {
      execute: jest
        .fn()
        .mockResolvedValue({ getProps: () => ({ isActive: true, cloudFailedAt: 0 }) }),
    };
    const serviceProvider = {
      queryBus,
      commandBus,
      logger: { warn: jest.fn(), error: jest.fn() },
      eventEmitter: { on: jest.fn(), off: jest.fn() },
    };
    const mqttService = {
      mqttReconnect: jest.fn().mockResolvedValue(undefined),
    };
    const shutdownOrchestrator = { registerHandler: jest.fn() };
    const service = new CloudConnectionService(
      serviceProvider as never,
      mqttService as never,
      {} as never,
      shutdownOrchestrator as never,
    );

    await (service as unknown as { checkConnectionStatus(): Promise<void> }).checkConnectionStatus();

    expect(CloudConnectionService.CLOUD_IS_AVAILABLE).toBe(false);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'nvr-1' }),
    );
  });
});
