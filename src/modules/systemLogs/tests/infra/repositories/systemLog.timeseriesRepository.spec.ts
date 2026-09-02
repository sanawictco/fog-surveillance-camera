import { SystemLogRepository } from '../../../infra/repositories/systemLog.timeseriesRepository';
import {
  SystemLogRecordFormat,
  SystemLogSections,
  SystemLogTypes,
} from '../../../domain/systemLog.type';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ timeseriesDb: { dbName: 'surveillance' } }),
}));
const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const tenantASuffix = '11111111111141118111111111111111';

const record: SystemLogRecordFormat = [
  tenantA,
  SystemLogTypes.WARNING,
  { key: "device's update failed", params: [] },
  SystemLogSections.VIDEO_DEVICES_LIVE_SIGNAL,
  'device-id',
];

function makeRepository(tdengineClient: { exec: jest.Mock }): SystemLogRepository {
  const repository = new SystemLogRepository({} as ServiceProvider);
  (repository as any).tdengineClient = tdengineClient;
  (repository as any).tdengineRestOptions = {
    restUrl: 'http://tdengine:6041',
    token: 'token',
  };
  return repository;
}

describe('SystemLogRepository', () => {
  it('ensures the tenant supertable once and writes to the server-derived tenant and severity child table', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await repository.insert({
      superTableName: 'caller_controlled_table',
      subTableName: 'caller_controlled_child',
      data: record,
      createdAt: 1_700_000_000_000,
    });
    await repository.insert({ data: record, createdAt: 1_700_000_000_001 });

    const createStableSqls = tdengineClient.exec.mock.calls.filter(
      ([sql]) => (sql as string).includes('CREATE STABLE'),
    );
    expect(createStableSqls).toHaveLength(1);
    expect(createStableSqls[0][0]).toContain(
      `CREATE STABLE IF NOT EXISTS system_log_t_${tenantASuffix} ` +
        '(createdAt TIMESTAMP,messageKey VARCHAR(200),messageParams VARCHAR(500),section VARCHAR(50),entityId VARCHAR(50)) ' +
        'TAGS (tenantId VARCHAR(36),groupId VARCHAR(15))',
    );

    const insertSql = tdengineClient.exec.mock.calls[1][0] as string;
    expect(insertSql).toContain(
      'surveillance.`system_log_t_' + tenantASuffix + '_warning`',
    );
    expect(insertSql).toContain(
      `USING surveillance.system_log_t_${tenantASuffix}`,
    );
    expect(insertSql).toContain('(tenantId, groupId)');
    expect(insertSql).toContain(`'${tenantA}', 'warning'`);
    expect(insertSql).toContain(
      '(createdAt, messageKey, messageParams, section, entityId)',
    );
    expect(insertSql).toContain("device''s update failed");
    expect(insertSql).not.toContain('caller_controlled_table');
    expect(insertSql).not.toContain('caller_controlled_child');

    // Second insert skips the stable check (ensured once per process).
    expect(tdengineClient.exec).toHaveBeenCalledTimes(3);
  });

  it('rejects a record whose severity is not a valid SystemLogTypes value', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await expect(
      repository.insert({
        data: [
          tenantA,
          "warning' OR 1=1 --" as SystemLogTypes,
          { key: 'device.update.failed', params: [] },
          SystemLogSections.VIDEO_DEVICES_LIVE_SIGNAL,
          'device-id',
        ],
      }),
    ).rejects.toThrow('system log type is invalid');
    expect(tdengineClient.exec).not.toHaveBeenCalled();
  });

  it('deletes records only from the requested tenant child tables', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);
    jest
      .spyOn(repository, 'findAll')
      .mockResolvedValueOnce([[1_700_000_000_000]])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await repository.deleteAll(tenantA, 'device-id');

    expect(repository.findAll).toHaveBeenCalledTimes(3);
    for (const [params] of (repository.findAll as jest.Mock).mock.calls) {
      expect(params.superTableName).toBe(`system_log_t_${tenantASuffix}`);
      expect(params.filter).toContain(`tenantId='${tenantA}'`);
      expect(params.filter).toContain("entityId='device-id'");
      expect(params.filter).not.toContain(tenantB);
    }
    expect(tdengineClient.exec).toHaveBeenCalledWith(
      expect.stringContaining(
        'system_log_t_11111111111141118111111111111111_error',
      ),
    );
    expect(tdengineClient.exec).not.toHaveBeenCalledWith(
      expect.stringContaining('system_log_t_22222222222242228222222222222222'),
    );
  });

  it('ensures the tenant supertable before cleanup so a fresh tenant cannot hit a missing-stable error', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);
    jest.spyOn(repository, 'findAll').mockResolvedValue([]);

    await repository.deleteAll(tenantA, 'device-id');

    expect(tdengineClient.exec.mock.calls[0][0]).toContain(
      `CREATE STABLE IF NOT EXISTS system_log_t_${tenantASuffix} `,
    );
  });

  it('ensures the tenant supertable on reads without duplicating DDL per process', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await repository.ensureSuperTable(tenantA);
    await repository.ensureSuperTable(tenantA);
    await repository.ensureSuperTable(tenantB);

    const createStableSqls = tdengineClient.exec.mock.calls.filter(
      ([sql]) => (sql as string).includes('CREATE STABLE'),
    );
    expect(createStableSqls).toHaveLength(2);
    expect(createStableSqls[0][0]).toContain(`system_log_t_${tenantASuffix}`);
    expect(createStableSqls[1][0]).toContain(
      `system_log_t_22222222222242228222222222222222`,
    );
  });

  it('allocates distinct timestamps for same-millisecond records in one child', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);
    const params = {
      data: [
        tenantA,
        SystemLogTypes.WARNING,
        { key: 'device.update.failed', params: [] },
        SystemLogSections.VIDEO_DEVICES_LIVE_SIGNAL,
        'device-id',
      ] as SystemLogRecordFormat,
      createdAt: 1_700_000_000_000,
    };

    await repository.insert(params);
    await repository.insert(params);

    expect(tdengineClient.exec.mock.calls[1][0]).toContain(
      'VALUES ( 1700000000000,',
    );
    expect(tdengineClient.exec.mock.calls[2][0]).toContain(
      'VALUES ( 1700000000001,',
    );
  });
});
