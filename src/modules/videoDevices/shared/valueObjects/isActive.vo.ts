import { ValueObject } from 'src/dddLib/core';
const INIT_VALUE = false;
export class IsActive extends ValueObject<boolean> {
  private _isActive: boolean;
  constructor(isActive: boolean) {
    super();
    this._isActive = isActive;
    this.validate();
  }
  get isActive() {
    return this._isActive;
  }
  protected validate(): void {}

  public unpack(): boolean {
    return this._isActive;
  }

  static init(): IsActive {
    return new IsActive(INIT_VALUE);
  }
}
