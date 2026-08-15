import { ValueObject } from 'src/dddLib/core';
import { ArgumentOutOfRangeException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class Name extends ValueObject<string> {
  private _name: string;
  constructor(name: string) {
    super();
    this._name = name;
    this.validate();
  }
  protected validate(): void {
    if (!Guard.isBetween(this._name, 1, 60))
      throw new ArgumentOutOfRangeException(
        `ValueObjectError: name=${this._name} is out of range`,
      );
  }

  public unpack(): string {
    return this._name;
  }
}
