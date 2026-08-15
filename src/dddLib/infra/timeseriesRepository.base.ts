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

export interface CreateSuperTableParams {
  superTableName: string;
  columnNames: string[];
  columnDataTypes: string[];
}

export interface CreateSubTableParams {
  superTableName: string;
  subTableName: string;
}

export interface InsertDataParams<RecordFormat> {
  superTableName: string;
  subTableName: string;
  data: RecordFormat;
  createdAt?: number;
}

export interface UpdateDataParams<RecordFormat> {
  superTableName: string;
  subTableName: string;
  data: RecordFormat;
  createdAt: number;
}

export interface DeleteDataParams {
  superTableName: string;
  createdAt: number;
}

export interface DeleteAllDataParams {
  superTableName: string;
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

export interface AggrigateDataParams {
  func: AggrigateMathFunctions;
  subTableName: string;
  columnIndex: number;
  timeRangeInUnix: TimeRangeInUnix;
}

export interface TimeseriesRepositoryBase<RecordFormat, Entity = unknown> {
  createSuperTable?(entity?: Entity): void;
  createSubTable?(params: CreateSubTableParams, entity?: Entity): void;
  deleteSubTable(subTableName: string): void;
  findAll(params: FindDataParams): Promise<any>;
  findAllPaginated(
    params: PaginatedTimeseriesQueryBase,
  ): Promise<Paginated<any>>;
  insert(params: InsertDataParams<RecordFormat>): Promise<void>;
  count(params: CountDataParams): Promise<number>;
  // aggregate funcations in math not ddd aggregate
  findAggrigate?(params: AggrigateDataParams): Promise<number>;
  clearSuperTable(superTableName: string): void;
}
