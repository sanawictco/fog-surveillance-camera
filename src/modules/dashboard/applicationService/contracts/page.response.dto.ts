import { ResponseBase } from 'src/dddLib/contracts/response.base';
import { PageTypes } from '../../domain/valueObjects/pageType.vo';
import { Widget } from '../../domain/valueObjects/pageContent.vo';

export class PageResponseDto extends ResponseBase {
  name!: string;
  type!: PageTypes;
  pageIndex!: number;
  content!: Widget[];
}
