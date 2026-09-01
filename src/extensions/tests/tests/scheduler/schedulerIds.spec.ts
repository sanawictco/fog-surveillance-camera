import {
  CLOUD_AVAILABILITY_SCHEDULER_ID,
  legacyNvrLiveSignalSchedulerId,
  nvrLiveSignalSchedulerId,
} from '../../scheduler/schedulerIds';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const NVR_A = '33333333-3333-4333-8333-333333333333';

describe('nvrLiveSignalSchedulerId', () => {
  it('scopes the schedule to a tenant and NVR', () => {
    expect(nvrLiveSignalSchedulerId(TENANT_A, NVR_A)).toBe(
      `tenant-${TENANT_A}-nvr-${NVR_A}-live-signal`,
    );
  });

  it('produces different identifiers for the same NVR ID under different tenants', () => {
    expect(nvrLiveSignalSchedulerId(TENANT_A, NVR_A)).not.toBe(
      nvrLiveSignalSchedulerId(TENANT_B, NVR_A),
    );
  });

  it('fails closed when a tenant is missing', () => {
    expect(() => nvrLiveSignalSchedulerId('', NVR_A)).toThrow(
      /tenant and NVR are required/,
    );
  });

  it('fails closed when an NVR is missing', () => {
    expect(() => nvrLiveSignalSchedulerId(TENANT_A, '')).toThrow(
      /tenant and NVR are required/,
    );
  });

  it('stays within the scheduler ID length limit', () => {
    // SchedulerService rejects IDs longer than 100 characters
    expect(nvrLiveSignalSchedulerId(TENANT_A, NVR_A).length).toBeLessThanOrEqual(
      100,
    );
  });

  it('uses only characters the scheduler ID validator accepts', () => {
    expect(nvrLiveSignalSchedulerId(TENANT_A, NVR_A)).toMatch(
      /^[a-zA-Z0-9_@.:-]+$/,
    );
  });

  it('does not collide with the pre-Phase-3 bare NVR identifier', () => {
    expect(nvrLiveSignalSchedulerId(TENANT_A, NVR_A)).not.toBe(
      legacyNvrLiveSignalSchedulerId(NVR_A),
    );
  });
});

describe('CLOUD_AVAILABILITY_SCHEDULER_ID', () => {
  it('names the genuinely global schedule explicitly', () => {
    expect(CLOUD_AVAILABILITY_SCHEDULER_ID).toBe('system-cloud-availability');
  });
});
