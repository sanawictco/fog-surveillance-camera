import { ValueObject } from 'src/dddLib/core';
import { ArgumentOutOfRangeException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils';

export interface Widget {
  id: string;
  widgetStructureIndex?: number;
}
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
      if (
        content.widgetStructureIndex &&
        !Guard.isUInt(content.widgetStructureIndex)
      )
        throw new ArgumentOutOfRangeException(
          `ValueObjectError: pageIndex=${i}, widgetStructureIndex=${content.widgetStructureIndex} is not unsigned integer`,
        );
    }
  }
  public unpack(): Widget[] {
    return this._pageContent;
  }
}
