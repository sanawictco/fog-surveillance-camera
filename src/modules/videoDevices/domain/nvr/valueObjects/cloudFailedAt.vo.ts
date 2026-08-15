import { ValueObject } from 'src/dddLib/core';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils';
const INIT_VALUE = 0;
export class CloudFailedAt extends ValueObject<number> {
  private _cloudFailedAt!: number;
  constructor(cloudFailedAt: number) {
    super();
    if (cloudFailedAt !== undefined) this._cloudFailedAt = cloudFailedAt;
    this.validate();
  }
  protected validate(): void {
    if (!this._cloudFailedAt) return;
    if (!Guard.isUnix(this._cloudFailedAt)) {
      throw new ArgumentInvalidException(
        `ValueObjectError: cloudFailedAt=${this._cloudFailedAt} is not a valid Unix Time`,
      );
    }
  }

  public unpack(): number {
    return this._cloudFailedAt;
  }

  static init(): CloudFailedAt {
    return new CloudFailedAt(INIT_VALUE);
  }
}
