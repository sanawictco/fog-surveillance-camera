import { randomBytes } from 'node:crypto';

export function generateRandomId(size: number) {
  return randomBytes(size).toString('hex');
}

export function generateRandomMsgId() {
  const randomInt = randomBytes(2).readUInt16BE(0);
  return `${randomInt}`;
}
