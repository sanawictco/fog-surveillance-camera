import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';
import { ActorLogTypes } from '../../domain/actorLog.type';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ timeseriesDb: { dbName: 'surveillance' } }),
}));

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const kioskId = '00000000-0000-0000-0000-000000000000';

function makeRepository(tdengineClient: { exec: jest.Mock }): ActorLogRepository {
  const repository = new ActorLogRepository({} as ServiceProvider);
  (repository as any).tdengineClient = tdengineClient;
  (repository as any).tdengineRestOptions = {
    restUrl: 'http://tdengine:6041',
    token: 'token',
  };
  return repository;
}

function insertParams(tenantId: string, actorId: string, createdAt?: number) {
  return {
    superTableName: 'caller_controlled_table',
    subTableName: 'caller_controlled_child',
    data: [
      tenantId,
      ActorLogTypes.EMPLOYEE,
      actorId,
      { key: "employee's role updated", params: ['+15551234567'] },
    ] as const,
    ...(createdAt !== undefined ? { createdAt } : {}),
  };
}

describe('ActorLogRepository.insert', () => {
  it('writes to the per-actor child table under the tenant supertable', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await repository.insert(
      insertParams(tenantA, '33333333-3333-4333-8333-333333333333'),
    );

    const [ddl, insertSql] = tdengineClient.exec.mock.calls.map(
      ([sql]: [string]) => sql,
    );
    expect(ddl).toBe(
      'CREATE STABLE IF NOT EXISTS actor_log_t_11111111111141118111111111111111 ' +
        '(createdAt TIMESTAMP,actorLogType VARCHAR(20),' +
        'messageKey VARCHAR(200),messageParams VARCHAR(500)) ' +
        'TAGS (tenantId VARCHAR(36),actorId NCHAR(36));',
    );
    expect(insertSql).toContain(
      'surveillance.`actor_log_t_11111111111141118111111111111111_33333333333343338333333333333333`',
    );
    expect(insertSql).toContain(
      'USING surveillance.actor_log_t_11111111111141118111111111111111 (tenantId, actorId)',
    );
    expect(insertSql).toContain(
      "'11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'",
    );
    expect(insertSql).toContain("employee''s role updated");
    expect(insertSql).not.toContain('caller_controlled');
    // actorId is a tag only — TDengine rejects a stable whose tag name
    // duplicates a column name, so it must not also appear in the column
    // list / VALUES.
    expect(insertSql).toContain(
      '(createdAt, actorLogType, messageKey, messageParams) VALUES (',
    );
  });

  it('creates the tenant supertable once per process', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await repository.insert(
      insertParams(tenantA, '33333333-3333-4333-8333-333333333333'),
    );
    await repository.insert(
      insertParams(tenantA, '44444444-4444-4444-8444-444444444444'),
    );

    const statements = tdengineClient.exec.mock.calls.map(
      ([sql]: [string]) => sql,
    );
    expect(
      statements.filter((sql: string) => sql.startsWith('CREATE STABLE')),
    ).toHaveLength(1);
    expect(statements[2]).toContain(
      'actor_log_t_11111111111141118111111111111111_44444444444444448444444444444444',
    );
  });

  it('creates a separate supertable per tenant', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await repository.insert(
      insertParams(tenantA, '33333333-3333-4333-8333-333333333333'),
    );
    await repository.insert(
      insertParams(tenantB, '33333333-3333-4333-8333-333333333333'),
    );

    const statements = tdengineClient.exec.mock.calls.map(
      ([sql]: [string]) => sql,
    );
    expect(
      statements.filter((sql: string) => sql.startsWith('CREATE STABLE')),
    ).toHaveLength(2);
    expect(statements[3]).toContain(
      'USING surveillance.actor_log_t_22222222222242228222222222222222 (tenantId, actorId)',
    );
  });

  it('writes kiosk actor logs into their own child table', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await repository.insert(insertParams(tenantA, kioskId));

    expect(tdengineClient.exec.mock.calls[1][0]).toContain(
      '`actor_log_t_11111111111141118111111111111111_00000000000000000000000000000000`',
    );
  });

  it('allocates distinct timestamps for same-millisecond records of one actor', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);
    const params = insertParams(
      tenantA,
      '33333333-3333-4333-8333-333333333333',
      1_700_000_000_000,
    );

    await repository.insert(params);
    await repository.insert(params);

    const inserts = tdengineClient.exec.mock.calls
      .map(([sql]: [string]) => sql)
      .filter((sql: string) => sql.startsWith('INSERT'));
    expect(inserts[0]).toContain('VALUES ( 1700000000000,');
    expect(inserts[1]).toContain('VALUES ( 1700000000001,');
  });

  it('rejects a malformed tenant before any SQL is produced', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await expect(
      repository.insert(
        insertParams(
          "not-a-uuid' OR '1'='1",
          '33333333-3333-4333-8333-333333333333',
        ),
      ),
    ).rejects.toThrow('tenantId must be a UUID v4');
    expect(tdengineClient.exec).not.toHaveBeenCalled();
  });

  it('rejects a malformed actor id before any SQL is produced', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await expect(
      repository.insert(insertParams(tenantA, "x' OR '1'='1")),
    ).rejects.toThrow('actorId must be a UUID');
    expect(tdengineClient.exec).not.toHaveBeenCalled();
  });

  it('rejects an unknown actor log type before any SQL is produced', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await expect(
      repository.insert({
        superTableName: 'ignored',
        subTableName: 'ignored',
        data: [
          tenantA,
          "EMPLOYEE' OR '1'='1" as ActorLogTypes,
          '33333333-3333-4333-8333-333333333333',
          { key: 'employee.role.updated', params: [] },
        ],
      }),
    ).rejects.toThrow('actor log type is invalid');
    expect(tdengineClient.exec).not.toHaveBeenCalled();
  });
});
