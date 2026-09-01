import { ValueObject } from 'src/dddLib/core';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class Username extends ValueObject<string> {
  private _username: string;
  constructor(username: string) {
    super();
    this._username = username;
    this.validate();
  }
  get username() {
    return this._username;
  }
  protected validate(): void {
    if (!Guard.isBetween(this._username, 4, 32))
      throw new ArgumentInvalidException(
        'ValueObjectError: camera username must be 4-32 characters',
      );
  }

  public unpack(): string {
    return this._username;
  }
}
