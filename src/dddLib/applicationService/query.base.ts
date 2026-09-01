import { FindDataParams } from '../infra/timeseriesRepository.base';

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
/**
 * Base class for timeseries queries
 */
export abstract class TimeseriesQueryBase extends FindDataParams {
  constructor(props: FindDataParams) {
    super();
    this.superTableName = props.superTableName;
    this.subTableName = props.subTableName;
    this.selectedColumns = props.selectedColumns;
    this.timeRangeInUnix = props.timeRangeInUnix;
    this.orderBy = props.orderBy;
  }
}

/**
 * Base class for timeseries queries
 */
export abstract class PaginatedTimeseriesQueryBase extends TimeseriesQueryBase {
  limit: number;
  page: number;
  constructor(props: FindDataParams & { page: number; limit: number }) {
    super(props);
    this.limit = props.limit || 15;
    this.page = props.page || 1;
  }
}
export class OrderBySetting {
  column: string;
  status: OrderStates;

  constructor(column: string, status: OrderStates) {
    this.column = column;
    this.status = status;
  }
}

export enum OrderStates {
  ASCENDING = 'ASC',
  DESCENDING = 'DESC',
}

export class TimeRangeInUnix {
  start: number;
  end: number;

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
  }
}
