import { ValueObject } from 'src/dddLib/core';
import {
  ArgumentInvalidException,
  ArgumentOutOfRangeException,
} from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class SerialNumber extends ValueObject<string> {
  private _serialNumber: string;
  constructor(serialNumber: string) {
    super();
    this._serialNumber = serialNumber;
    this.validate();
  }
  protected validate(): void {
    if (!Guard.isBetween(this._serialNumber, 8, 8))
      throw new ArgumentOutOfRangeException(
        `ValueObjectError: serialNumber=${this._serialNumber} is out of range`,
      );
    if (!Guard.isUpperCase(this._serialNumber))
      throw new ArgumentInvalidException(
        'ValueObjectError: serialNumber must be upper case',
      );
  }

  public unpack(): string {
    return this._serialNumber;
  }
}
