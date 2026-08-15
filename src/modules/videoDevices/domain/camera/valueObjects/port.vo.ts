import { ValueObject } from 'src/dddLib/core';
import { ArgumentOutOfRangeException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class Port extends ValueObject<number> {
  private _port: number;
  constructor(port: number) {
    super();
    this._port = port;
    this.validate();
  }
  protected validate(): void {
    if (!Guard.isPort(this._port))
      throw new ArgumentOutOfRangeException(
        `ValueObjectError: port=${this._port} is not valid`,
      );
  }

  public unpack(): number {
    return this._port;
  }
}
