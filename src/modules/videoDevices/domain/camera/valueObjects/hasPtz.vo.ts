import { ValueObject } from 'src/dddLib/core';
export class HasPtz extends ValueObject<boolean> {
  private _hasPtz: boolean;
  constructor(hasPtz: boolean) {
    super();
    this._hasPtz = hasPtz;
    this.validate();
  }
  get hasPtz() {
    return this._hasPtz;
  }
  protected validate(): void {}

  public unpack(): boolean {
    return this._hasPtz;
  }
}
