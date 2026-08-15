import { ValueObject } from 'src/dddLib/core';
export class HasAudio extends ValueObject<boolean> {
  private _hasAudio: boolean;
  constructor(hasAudio: boolean) {
    super();
    this._hasAudio = hasAudio;
    this.validate();
  }
  get hasAudio() {
    return this._hasAudio;
  }
  protected validate(): void {}

  public unpack(): boolean {
    return this._hasAudio;
  }
}
