import { ValueObject } from 'src/dddLib/core';

const INIT_VALUE = false;

export class IsDeleted extends ValueObject<boolean> {
  private _isDeleted: boolean;
  constructor(isDeleted: boolean) {
    super();
    this._isDeleted = isDeleted;
    this.validate();
  }
  protected validate(): void {}

  public unpack(): boolean {
    return this._isDeleted;
  }

  static init(): IsDeleted {
    return new IsDeleted(INIT_VALUE);
  }
}
