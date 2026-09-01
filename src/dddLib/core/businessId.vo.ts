import { ValueObject } from 'src/dddLib/core';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class BusinessId extends ValueObject<string> {
  private readonly _businessId: string;

  constructor(businessId: string) {
    super();
    this._businessId = businessId;
    this.validate();
  }

  protected validate(): void {
    if (
      typeof this._businessId !== 'string' ||
      this._businessId.length === 0 ||
      !Guard.isUUIDv4(this._businessId)
    )
      throw new ArgumentInvalidException(
        `ValueObjectError: businessId=${this._businessId} is not uuid`,
      );
  }

  public unpack(): string {
    return this._businessId;
  }
}
