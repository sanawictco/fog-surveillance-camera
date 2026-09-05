import { CloudRecoveryService } from '../../../applicationService/services/cloudRecovery.service';
import { CloudConnectionService } from '../../../applicationService/services/cloudConnection.service';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    nvrId: 'nvr-1',
    tenantId: '11111111-1111-4111-8111-111111111111',
    timeseriesDb: { dbName: 'fog-timeseries-db' },
  }),
}));

describe('CloudRecoveryService.getCloudRecoveryAck', () => {
  afterEach(() => {
    CloudConnectionService.CLOUD_IS_AVAILABLE = false;
  });

  it('resets cloudFailedAt to 0, marks the cloud available again, and clears local audit-trail data', async () => {
    CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = true;
    let cloudIsAvailableWhenCommandDispatched: boolean | undefined;
    const commandBus = {
      execute: jest.fn().mockImplementation(async () => {
        cloudIsAvailableWhenCommandDispatched = CloudConnectionService.CLOUD_IS_AVAILABLE;
      }),
    };
    const serviceProvider = {
      commandBus,
      eventEmitter: { on: jest.fn(), emit: jest.fn() },
      logger: { error: jest.fn() },
    };
    const actorLogApiForCloudConnectionService = { clearData: jest.fn().mockResolvedValue(undefined) };
    const systemLogApiForCloudConnectionService = { clearData: jest.fn().mockResolvedValue(undefined) };
    const service = new CloudRecoveryService(
      serviceProvider as never,
      actorLogApiForCloudConnectionService as never,
      systemLogApiForCloudConnectionService as never,
    );
    jest.spyOn(service as any, 'cleanBackup').mockResolvedValue(undefined);

    await service.getCloudRecoveryAck({ topic: 't', message: 'ok' });

    expect(cloudIsAvailableWhenCommandDispatched).toBe(false);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'nvr-1', cloudFailedAt: 0 }),
    );
    expect(CloudConnectionService.CLOUD_IS_AVAILABLE).toBe(true);
    expect(CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED).toBe(false);
    expect(actorLogApiForCloudConnectionService.clearData).toHaveBeenCalledTimes(1);
    expect(systemLogApiForCloudConnectionService.clearData).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no recovery process is in flight', async () => {
    CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
    const commandBus = { execute: jest.fn() };
    const service = new CloudRecoveryService(
      { commandBus, eventEmitter: { on: jest.fn() } } as never,
      {} as never,
      {} as never,
    );

    await service.getCloudRecoveryAck({ topic: 't', message: 'ok' });

    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});

describe('CloudRecoveryService.startCloudRecoveryProcess', () => {
  beforeEach(() => {
    CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
  });

  afterEach(() => {
    CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
  });

  it('runs the recovery steps in order: clean, mongo, tdengine, compress, upload', async () => {
    const service = new CloudRecoveryService(
      { logger: { error: jest.fn() } } as never,
      {} as never,
      {} as never,
    );
    const recoverySteps: string[] = [];
    const recovery = service as unknown as {
      cleanBackup: () => Promise<void>;
      createMongoBackup: () => Promise<void>;
      createTimeSeriesBackup: (cloudFailedAt: number) => Promise<void>;
      compressBackup: () => Promise<void>;
      uploadBackup: () => Promise<void>;
    };
    jest
      .spyOn(recovery, 'cleanBackup')
      .mockImplementation(async () => void recoverySteps.push('clean'));
    jest
      .spyOn(recovery, 'createMongoBackup')
      .mockImplementation(async () => void recoverySteps.push('mongo'));
    jest
      .spyOn(recovery, 'createTimeSeriesBackup')
      .mockImplementation(async () => void recoverySteps.push('tdengine'));
    jest
      .spyOn(recovery, 'compressBackup')
      .mockImplementation(async () => void recoverySteps.push('compress'));
    jest
      .spyOn(recovery, 'uploadBackup')
      .mockImplementation(async () => void recoverySteps.push('upload'));

    await service.startCloudRecoveryProcess({
      getProps: () => ({ cloudFailedAt: 1735689600000 }),
    } as never);

    expect(recoverySteps).toEqual([
      'clean',
      'mongo',
      'tdengine',
      'compress',
      'upload',
    ]);
  });

  it('aborts the recovery without uploading when the TDengine dump rejects, and getCloudRecoveryAck is a no-op afterward', async () => {
    const commandBus = { execute: jest.fn() };
    const actorLogApiForCloudConnectionService = {
      clearData: jest.fn().mockResolvedValue(undefined),
    };
    const systemLogApiForCloudConnectionService = {
      clearData: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CloudRecoveryService(
      {
        logger: { error: jest.fn() },
        commandBus,
        eventEmitter: { on: jest.fn(), emit: jest.fn() },
      } as never,
      actorLogApiForCloudConnectionService as never,
      systemLogApiForCloudConnectionService as never,
    );
    const recovery = service as unknown as {
      cleanBackup: () => Promise<void>;
      createMongoBackup: () => Promise<void>;
      createTimeSeriesBackup: (cloudFailedAt: number) => Promise<void>;
      compressBackup: () => Promise<void>;
      uploadBackup: () => Promise<void>;
    };
    jest.spyOn(recovery, 'cleanBackup').mockResolvedValue(undefined);
    jest.spyOn(recovery, 'createMongoBackup').mockResolvedValue(undefined);
    jest
      .spyOn(recovery, 'createTimeSeriesBackup')
      .mockRejectedValue(new Error('taosdump exited with code 1'));
    const compressBackup = jest
      .spyOn(recovery, 'compressBackup')
      .mockResolvedValue(undefined);
    const uploadBackup = jest
      .spyOn(recovery, 'uploadBackup')
      .mockResolvedValue(undefined);

    await service.startCloudRecoveryProcess({
      getProps: () => ({ cloudFailedAt: 1735689600000 }),
    } as never);

    // The archive must never be finished or shipped without its TDengine
    // half: this is the data-loss bug this task exists to close. A future
    // try/catch swallowing createTimeSeriesBackup's rejection one layer up
    // (in startCloudRecoveryProcess) would let both of these run.
    expect(compressBackup).not.toHaveBeenCalled();
    expect(uploadBackup).not.toHaveBeenCalled();
    expect(CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED).toBe(false);

    // No archive was uploaded, so an ack must never be acted on: it would
    // call clearData() and destroy logs the cloud never received.
    await service.getCloudRecoveryAck({ topic: 't', message: 'ok' });

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(actorLogApiForCloudConnectionService.clearData).not.toHaveBeenCalled();
    expect(systemLogApiForCloudConnectionService.clearData).not.toHaveBeenCalled();
  });
});

describe('CloudRecoveryService.createTimeSeriesBackup', () => {
  const ENV_KEYS = [
    'TIME_SERIES_DB_HOST',
    'TIME_SERIES_DB_NATIVE_PORT',
    'TIME_SERIES_DB_USER',
    'TIME_SERIES_DB_PASSWORD',
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Pin the connection-flag defaults regardless of what the ambient
    // environment happens to have set, so the argv assertions below are
    // deterministic.
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  function buildService() {
    const service = new CloudRecoveryService({ logger: { error: jest.fn() } } as never, {} as never, {} as never);
    const runCommand = jest
      .spyOn(service as never, 'runCommand')
      .mockResolvedValue(undefined as never);
    return { service, runCommand };
  }

  it('dumps only this tenant\'s two supertables, escaped, since cloudFailedAt', async () => {
    const { service, runCommand } = buildService();

    await (
      service as unknown as {
        createTimeSeriesBackup(cloudFailedAt: number): Promise<void>;
      }
    ).createTimeSeriesBackup(1735689600000);

    expect(runCommand).toHaveBeenCalledTimes(1);
    const [command, args] = runCommand.mock.calls[0]!;
    expect(command).toBe('taosdump');
    // Connection flags: with no TIME_SERIES_DB_* overrides set, taosdump
    // must fall back to fog's own native-port defaults.
    expect(args[args.indexOf('-h') + 1]).toBe('tdengine-fog');
    expect(args[args.indexOf('-P') + 1]).toBe('6030');
    expect(args[args.indexOf('-u') + 1]).toBe('root');
    // -p and its password are a single merged token; with no password set
    // this must be exactly '-p', not e.g. missing or carrying a stray value.
    expect(args).toContain('-p');
    // -e is mandatory: the real db name (surveillance-fog) contains a hyphen,
    // and taosdump emits it unescaped without this flag.
    expect(args).toContain('-e');
    expect(args).toContain('fog-timeseries-db');
    expect(args).toContain('actor_log_t_11111111111141118111111111111111');
    expect(args).toContain('system_log_t_11111111111141118111111111111111');
    expect(args[args.indexOf('-S') + 1]).toBe('1735689600000');
    expect(args[args.indexOf('-o') + 1]).toBe('/fog_shared_backups/tdengine');
    // taosdump unconditionally writes a dump_result.txt log to its cwd,
    // which the unprivileged node user may not be able to write to in
    // production; -r redirects it into the (writable) backup dir instead.
    expect(args[args.indexOf('-r') + 1]).toBe(
      '/fog_shared_backups/tdengine/dump_result.txt',
    );
  });

  it('propagates a dump failure so the archive never uploads without its TDengine half', async () => {
    const { service, runCommand } = buildService();
    runCommand.mockRejectedValue(new Error('taosdump exited with code 1') as never);

    await expect(
      (
        service as unknown as {
          createTimeSeriesBackup(cloudFailedAt: number): Promise<void>;
        }
      ).createTimeSeriesBackup(1735689600000),
    ).rejects.toThrow('taosdump exited with code 1');
  });
});
