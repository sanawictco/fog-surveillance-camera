import { ValueObject } from 'src/dddLib/core';
import { ArgumentOutOfRangeException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class MacAddress extends ValueObject<string> {
  private _macAddress: string;
  constructor(macAddress: string) {
    super();
    this._macAddress = macAddress;
    this.validate();
  }
  protected validate(): void {
    if (!Guard.isMacAddress(this._macAddress))
      throw new ArgumentOutOfRangeException(
        `ValueObjectError: macAddress=${this._macAddress} is not valid`,
      );
  }

  public unpack(): string {
    return this._macAddress;
  }
}
