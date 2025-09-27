/**
 * Base class for regular queries
 */
export abstract class QueryBase<Props> {
  filter?: Partial<Props>;
  orderBy?: OrderBySetting;
  constructor(props?: QueryBaseParams<Props>) {
    this.filter = props?.filter;
    this.orderBy = props?.orderBy;
  }
}
export type QueryBaseParams<T> = {
  filter?: Partial<T>;
  orderBy?: OrderBySetting;
};
/**
 * Base class for paginated queries
 */
export abstract class PaginatedQueryBase<Props> extends QueryBase<Props> {
  limit: number;
  page: number;

  constructor(props: QueryBaseParams<Props> & { limit: number; page: number }) {
    super(props);
    this.limit = props.limit || 15;
    this.page = props.page || 1;
  }
}

export class OrderBySetting {
  column: string;
  status: OrderStates;
}

export enum OrderStates {
  ASCENDING = 'ASC',
  DESCENDING = 'DESC',
}

export class TimeRangeInUnix {
  start: number;
  end: number;
}
