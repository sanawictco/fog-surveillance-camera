import { ValueObject } from 'src/dddLib/core';
import { ArgumentOutOfRangeException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class PageIndex extends ValueObject<number> {
  private _pageIndex: number;
  constructor(pageIndex: number) {
    super();
    this._pageIndex = pageIndex;
    this.validate();
  }

  protected validate(): void {
    if (!Guard.isUInt(this._pageIndex))
      throw new ArgumentOutOfRangeException(
        `ValueObjectError: pageIndex=${this._pageIndex} is out of range`,
      );
  }

  public unpack(): number {
    return this._pageIndex;
  }
}
