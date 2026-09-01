import { ValueObject } from 'src/dddLib/core';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';

export enum PageTypes {
  WIDGET = 'widget',
}
export class Page extends ValueObject<PageTypes> {
  private _pageType: PageTypes;
  constructor(pageType: PageTypes) {
    super();
    this._pageType = pageType;
    this.validate();
  }
  get role() {
    return this._pageType;
  }
  protected validate(): void {
    if (!Object.values(PageTypes).includes(this._pageType)) {
      throw new ArgumentInvalidException(
        `ValueObjectError: pageType=${this._pageType} which is invalid`,
      );
    }
  }

  public unpack(): PageTypes {
    return this._pageType;
  }
}
