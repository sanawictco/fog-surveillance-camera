import { ValueObject } from 'src/dddLib/core';
import { ArgumentOutOfRangeException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils';

export class Widget {
  constructor(public id: string) {}
}

export const MAX_LIVE_DIAGRAM_PARAMS_COUNT = 10;

export class PageContent extends ValueObject<Widget[]> {
  private _pageContent: Widget[];
  constructor(pageContent: Widget[]) {
    super();
    this._pageContent = pageContent;
    this.validate();
  }
  protected validate(): void {
    let i = -1;
    for (const content of this._pageContent) {
      i++;
      if (!Guard.isUUIDv4(content.id))
        throw new ArgumentOutOfRangeException(
          `ValueObjectError: pageIndex=${i}, widgetId=${content.id} is not in uuid format`,
        );
    }
  }
  public unpack(): Widget[] {
    return this._pageContent;
  }
}
