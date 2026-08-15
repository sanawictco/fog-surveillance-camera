import { ValueObject } from 'src/dddLib/core';
import { ArgumentOutOfRangeException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class MaxCameras extends ValueObject<number> {
  private _maxCameras: number;
  constructor(maxCameras: number) {
    super();
    this._maxCameras = maxCameras;
    this.validate();
  }
  protected validate(): void {
    if (!Guard.isUInt(this._maxCameras))
      throw new ArgumentOutOfRangeException(
        `ValueObjectError: maxCameras=${this._maxCameras} is out of range`,
      );
  }
  public unpack(): number {
    return this._maxCameras;
  }
}
