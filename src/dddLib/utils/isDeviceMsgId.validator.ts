import { ValidateBy } from 'class-validator';
import { isValidDeviceMsgId } from './deviceMessageId';

export function IsDeviceMsgId(): PropertyDecorator {
  return ValidateBy({
    name: 'isDeviceMsgId',
    validator: {
      validate(value: unknown): boolean {
        return typeof value === 'string' && isValidDeviceMsgId(value);
      },
      defaultMessage(): string {
        return 'msgId must be a decimal string from 1 through 4294967295';
      },
    },
  });
}
