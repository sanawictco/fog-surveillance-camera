import {
  OrderBySetting,
  PaginatedTimeseriesQueryBase,
  TimeRangeInUnix,
} from '../applicationService';
import { Paginated } from './repository.base';

export class FindDataParams {
  superTableName?: string;
  subTableName?: string;
  selectedColumns?: string[];
  orderBy?: OrderBySetting;
  timeRangeInUnix?: TimeRangeInUnix;
  limit?: number;
  filter?: string;
}

export class CreateSuperTableParams {
  superTableName: string;
  columnNames: string[];
  columnDataTypes: string[];
  tags?: Array<{ name: string; dataType: string }>;

  constructor(
    superTableName: string,
    columnNames: string[],
    columnDataTypes: string[],
    tags?: Array<{ name: string; dataType: string }>,
  ) {
    this.superTableName = superTableName;
    this.columnNames = columnNames;
    this.columnDataTypes = columnDataTypes;
    this.tags = tags;
  }
}

export class CreateSubTableParams {
  superTableName: string;
  subTableName: string;

  constructor(superTableName: string, subTableName: string) {
    this.superTableName = superTableName;
    this.subTableName = subTableName;
  }
}

export class InsertDataParams<RecordFormat> {
  /**
   * Table names are optional because tenant-isolated repositories derive
   * them server-side from validated identity and ignore caller values.
   */
  superTableName?: string;
  subTableName?: string;
  data: RecordFormat;
  createdAt?: number;

  constructor(
    superTableName?: string,
    subTableName?: string,
    data?: RecordFormat,
    createdAt?: number,
  ) {
    this.superTableName = superTableName;
    this.subTableName = subTableName;
    this.data = data as RecordFormat;
    this.createdAt = createdAt;
  }
}

export class UpdateDataParams<RecordFormat> {
  superTableName: string;
  subTableName: string;
  data: RecordFormat;
  createdAt: number;

  constructor(
    superTableName: string,
    subTableName: string,
    data: RecordFormat,
    createdAt: number,
  ) {
    this.superTableName = superTableName;
    this.subTableName = subTableName;
    this.data = data;
    this.createdAt = createdAt;
  }
}

export class DeleteDataParams {
  superTableName: string;
  createdAt: number;

  constructor(superTableName: string, createdAt: number) {
    this.superTableName = superTableName;
    this.createdAt = createdAt;
  }
}

export class DeleteAllDataParams {
  superTableName: string;

  constructor(superTableName: string) {
    this.superTableName = superTableName;
  }
}

export class CountDataParams {
  superTableName?: string;
  subTableName?: string;
  timeRangeInUnix?: TimeRangeInUnix;
  filter?: string;
}

export enum AggrigateMathFunctions {
  AVG = 'avg',
  LAST = 'last',
  MAX = 'max',
  MIN = 'min',
}

export class AggrigateDataParams {
  func: AggrigateMathFunctions;
  subTableName: string;
  columnIndex: number;
  timeRangeInUnix: TimeRangeInUnix;

  constructor(
    func: AggrigateMathFunctions,
    subTableName: string,
    columnIndex: number,
    timeRangeInUnix: TimeRangeInUnix,
  ) {
    this.func = func;
    this.subTableName = subTableName;
    this.columnIndex = columnIndex;
    this.timeRangeInUnix = timeRangeInUnix;
  }
}

export interface TimeseriesRepositoryBase<RecordFormat, Entity = unknown> {
  createSuperTable?(entity?: Entity): Promise<void>;
  createSubTable(params: CreateSubTableParams, entity?: Entity): Promise<void>;
  deleteSubTable(subTableName: string): Promise<void>;
  findAll(params: FindDataParams): Promise<any>;
  findAllPaginated(
    params: PaginatedTimeseriesQueryBase,
  ): Promise<Paginated<any>>;
  insert(params: InsertDataParams<RecordFormat>): Promise<void>;
  count(params: CountDataParams): Promise<number>;
  // aggregate funcations in math not ddd aggregate
  findAggrigate?(params: AggrigateDataParams): Promise<number>;
  update?(params: Entity): Promise<Entity>;
}
