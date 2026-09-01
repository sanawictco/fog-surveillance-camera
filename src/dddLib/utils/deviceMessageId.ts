export const MAX_DEVICE_MSG_ID = 0xffffffff;

export function isValidDeviceMsgId(msgId: string): boolean {
  if (!/^[1-9]\d{0,9}$/.test(msgId)) return false;
  return Number(msgId) <= MAX_DEVICE_MSG_ID;
}

export function buildDeviceJobId(
  tenantId: string,
  nvrId: string,
  msgId: string,
): string {
  if (!tenantId || !nvrId || !isValidDeviceMsgId(msgId)) {
    throw new Error('invalid scoped device message ID');
  }
  return `t-${tenantId}-n-${nvrId}-m-${msgId}`;
}
