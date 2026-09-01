/**
 * Single owner of scheduler identifiers.
 *
 * Scheduler IDs are shared BullMQ keys. Before Phase 3 the NVR live-signal
 * scheduler was keyed by bare `nvrId`, which is tenant-ambiguous in shared
 * infrastructure and made `remove()` impossible to reason about per tenant.
 * Tenant-owned schedules are now explicitly tenant-scoped, and genuinely
 * global ones are named `system-*` so a missing tenant can never be mistaken
 * for "all tenants".
 */

export function nvrLiveSignalSchedulerId(
  tenantId: string,
  nvrId: string,
): string {
  if (!tenantId || !nvrId) {
    throw new Error('tenant and NVR are required for a scheduler identifier');
  }
  return `tenant-${tenantId}-nvr-${nvrId}-live-signal`;
}

/**
 * The pre-Phase-3 identifier for the same schedule. Retained only so a process
 * that restarts after a deploy can remove the schedule it created under the old
 * key; nothing creates schedules with this shape anymore.
 */
export function legacyNvrLiveSignalSchedulerId(nvrId: string): string {
  return nvrId;
}

export const CLOUD_AVAILABILITY_SCHEDULER_ID = 'system-cloud-availability';
