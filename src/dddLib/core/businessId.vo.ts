import { ValueObject } from 'src/dddLib/core';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';
const INIT_VALUE = '';
export class BusinessId extends ValueObject<string> {
  private _businessId: string;
  constructor(businessId: string) {
    super();
    this._businessId = businessId;
    this.validate();
  }
  protected validate(): void {
    if (this._businessId === INIT_VALUE) {
      return;
    }
    if (!Guard.isUUIDv4(this._businessId))
      throw new ArgumentInvalidException(
        `ValueObjectError: businessId=${this._businessId} is not uuid`,
      );
  }

  public unpack(): string {
    return this._businessId;
  }

  static init(): BusinessId {
    return new BusinessId(INIT_VALUE);
  }
}
