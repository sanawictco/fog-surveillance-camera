import { ValueObject } from 'src/dddLib/core';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class Password extends ValueObject<string> {
  private _password: string;
  constructor(password: string) {
    super();
    this._password = password;
    this.validate();
  }
  get password() {
    return this._password;
  }
  protected validate(): void {
    if (!Guard.isBetween(this._password, 12, 30))
      throw new ArgumentInvalidException(
        'ValueObjectError: camera password must be 12-30 characters',
      );
  }

  public unpack(): string {
    return this._password;
  }
}
