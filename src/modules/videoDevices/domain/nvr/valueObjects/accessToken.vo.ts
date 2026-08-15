import { ValueObject } from 'src/dddLib/core';
import { ArgumentOutOfRangeException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class AccessToken extends ValueObject<string> {
  private _accessToken: string;
  constructor(at: string) {
    super();
    this._accessToken = at;
    this.validate();
  }
  get accessToken() {
    return this._accessToken;
  }
  protected validate(): void {
    if (!Guard.isBetween(this._accessToken, 32, 32))
      throw new ArgumentOutOfRangeException(
        `ValueObjectError: accessToken=${this._accessToken} is out of range`,
      );
  }
  public unpack(): string {
    return this._accessToken;
  }
}
