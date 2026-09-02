import { ActorLogRepository } from '../../infra/actorLog.timeseriesRepository';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ timeseriesDb: { dbName: 'surveillance' } }),
}));

const tenantA = '11111111-1111-4111-8111-111111111111';
const actorId = '33333333-3333-4333-8333-333333333333';

function makeRepository(tdengineClient: { exec: jest.Mock }): ActorLogRepository {
  const repository = new ActorLogRepository({} as ServiceProvider);
  (repository as any).tdengineClient = tdengineClient;
  (repository as any).tdengineRestOptions = {
    restUrl: 'http://tdengine:6041',
    token: 'token',
  };
  return repository;
}

describe('ActorLogRepository.dropByActor', () => {
  it('drops the actor child table inside the tenant supertable only', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await repository.dropByActor(tenantA, actorId);

    expect(tdengineClient.exec).toHaveBeenCalledTimes(1);
    expect(tdengineClient.exec).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS surveillance.`actor_log_t_11111111111141118111111111111111_33333333333343338333333333333333`;',
    );
  });

  it('never touches another tenant supertable', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await repository.dropByActor(tenantA, actorId);

    expect(tdengineClient.exec.mock.calls[0][0]).not.toContain(
      'actor_log_t_22222222222242228222222222222222',
    );
  });

  it('rejects a malformed tenant before any SQL is produced', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await expect(
      repository.dropByActor("not-a-uuid' OR '1'='1", actorId),
    ).rejects.toThrow('tenantId must be a UUID v4');
    expect(tdengineClient.exec).not.toHaveBeenCalled();
  });

  it('rejects a malformed actor id before any SQL is produced', async () => {
    const tdengineClient = { exec: jest.fn().mockResolvedValue(undefined) };
    const repository = makeRepository(tdengineClient);

    await expect(
      repository.dropByActor(tenantA, 'x'.repeat(37)),
    ).rejects.toThrow('actorId must be a UUID');
    expect(tdengineClient.exec).not.toHaveBeenCalled();
  });
});
