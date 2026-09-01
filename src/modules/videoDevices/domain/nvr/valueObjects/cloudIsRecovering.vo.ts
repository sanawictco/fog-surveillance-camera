import { ValueObject } from 'src/dddLib/core';
const INIT_VALUE = false;
export class CloudIsRecovering extends ValueObject<boolean> {
  private _cloudIsRecovering: boolean;
  constructor(cloudIsRecovering: boolean) {
    super();
    this._cloudIsRecovering = cloudIsRecovering;
    this.validate();
  }
  get cloudIsRecovering() {
    return this._cloudIsRecovering;
  }
  protected validate(): void {}

  public unpack(): boolean {
    return this._cloudIsRecovering;
  }

  static init(): CloudIsRecovering {
    return new CloudIsRecovering(INIT_VALUE);
  }
}
