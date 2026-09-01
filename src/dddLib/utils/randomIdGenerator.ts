import { randomBytes } from 'node:crypto';

export function generateRandomId(size: number) {
  return randomBytes(size).toString('hex');
}

export function generateRandomMsgId(): string {
  let msgId = 0;
  while (msgId === 0) {
    msgId = randomBytes(4).readUInt32BE(0);
  }
  return String(msgId);
}
