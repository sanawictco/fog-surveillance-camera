import {
  buildDeviceJobId,
  isValidDeviceMsgId,
} from '../../utils/deviceMessageId';
import { generateRandomMsgId } from '../../utils/randomIdGenerator';

describe('deviceMessageId', () => {
  it('generates nonzero unsigned 32-bit message IDs', () => {
    for (let index = 0; index < 1000; index++) {
      const msgId = generateRandomMsgId();
      expect(typeof msgId).toBe('string');
      expect(isValidDeviceMsgId(msgId)).toBe(true);
    }
  });

  it('creates different queue keys for the same ID in different scopes', () => {
    const first = buildDeviceJobId('tenant-a', 'nvr-a', '101');
    const second = buildDeviceJobId('tenant-a', 'nvr-b', '101');
    const third = buildDeviceJobId('tenant-b', 'nvr-a', '101');

    expect(new Set([first, second, third]).size).toBe(3);
    expect(first).toBe('t-tenant-a-n-nvr-a-m-101');
  });

  it.each(['0', '-1', '4294967296', '1.5', '01', '', ' 1'])(
    'rejects invalid message ID %s',
    (msgId) => {
      expect(() => buildDeviceJobId('tenant-a', 'nvr-a', msgId)).toThrow(
        'invalid scoped device message ID',
      );
    },
  );
});
