import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { WsSql } from '@tdengine/websocket';
import axios from 'axios';
import AppConfig from 'configs/app.config';
import { PaginatedTimeseriesQueryBase } from 'src/dddLib/applicationService';
import { Paginated } from 'src/dddLib/infra';
import {
  CountDataParams,
  CreateSubTableParams,
  FindDataParams,
} from 'src/dddLib/infra/timeseriesRepository.base';
import { ObjectExtension } from 'src/dddLib/utils/objectExtension';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import {
  ACTOR_LOG_SUPER_TABLE,
  actorLogColumnNames,
  actorLogColumnTypes,
} from 'src/modules/actorLogs/domain/actorLog.type';
import {
  SYSTEM_LOG_SUPER_TABLE,
  systemLogColumnNames,
  systemLogColumnTypes,
  systemlogSubTableNames,
} from 'src/modules/systemLogs/domain/systemLog.type';
export interface SuperTableDto {
  superTableName: string;
  rowCount: number;
}
export interface TdengineRestOptions {
  restUrl: string;
  token: string;
}
export const TDENGINE_CLIENT = Symbol('TDENGINE_CLIENT');
export const TDENGINE_RESTFULL_OPTIONS = Symbol('TDENGINE_RESTFULL_OPTIONS');

@Injectable()
export class TimeseriesRepository implements OnApplicationBootstrap {
  @Inject(TDENGINE_CLIENT) protected readonly tdengineClient!: WsSql;
  @Inject(TDENGINE_RESTFULL_OPTIONS)
  protected readonly tdengineRestOptions!: TdengineRestOptions;
  constructor() {}
  async onApplicationBootstrap() {
    await this.tdengineClient.exec(
      TimeSeriesDbExtension.createSuperTableQuery(
        {
          superTableName: ACTOR_LOG_SUPER_TABLE,
          columnNames: actorLogColumnNames,
          columnDataTypes: actorLogColumnTypes,
        },
        45,
      ),
    );
    await this.tdengineClient.exec(
      TimeSeriesDbExtension.createSuperTableQuery(
        {
          superTableName: SYSTEM_LOG_SUPER_TABLE,
          columnNames: systemLogColumnNames,
          columnDataTypes: systemLogColumnTypes,
        },
        15,
      ),
    );

    for (const subTableName of systemlogSubTableNames) {
      await this.tdengineClient.exec(
        TimeSeriesDbExtension.createSubTableQuery({
          superTableName: SYSTEM_LOG_SUPER_TABLE,
          subTableName,
        }),
      );
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createSubTable(
    params: CreateSubTableParams,
    _entity?: unknown,
  ): Promise<void> {
    const createSubTableSqlCommand =
      TimeSeriesDbExtension.createSubTableQuery(params);
    await this.tdengineClient.exec(createSubTableSqlCommand);
  }

  async findAll(params: FindDataParams): Promise<any> {
    if (
      ObjectExtension.isObjectEmpty(
        params as unknown as Record<string, unknown>,
      )
    )
    return new Promise((resolve) => {
      setTimeout(async () => {
        const query = TimeSeriesDbExtension.createFindAllQuery(params);
        const data = await this.restQuery(query);
        if (data) resolve(data);
        else resolve([]);
      }, 0);
    });
  }

  async findAllPaginated(
    params: PaginatedTimeseriesQueryBase,
  ): Promise<Paginated<any>> {
    if (
      ObjectExtension.isObjectEmpty(
        params as unknown as Record<string, unknown>,
      )
    )
      throw new Error('params in find method is empty');
    return new Promise((resolve) => {
      setTimeout(async () => {
        const query = TimeSeriesDbExtension.createFindAllQuery(params);
        const data: any = await this.restQuery(query);
        if (data)
          resolve({
            totalDocs: await this.count({
              superTableName: params.superTableName,
              subTableName: params.subTableName,
              timeRangeInUnix: params.timeRangeInUnix,
              filter: params.filter,
            }),
            page: params.page,
            limit: params.limit,
            docs: data,
          });
        else
          resolve({
            totalDocs: 0,
            page: params.page,
            limit: params.limit,
            docs: [],
          });
      }, 0);
    });
  }

  async deleteSubTable(subTableName: string) {
    const dropSqlSubTableCommand =
      'DROP TABLE IF EXISTS ' + '`' + `${subTableName}` + '`;';
    await this.tdengineClient.exec(dropSqlSubTableCommand);
  }
  async count(params: CountDataParams): Promise<number> {
    const { superTableName, subTableName } = params;
    if (superTableName === undefined && subTableName === undefined)
      throw new Error('parameter is not valid in count function');

    const query = TimeSeriesDbExtension.createCountQuery(params);
    const queryResult = await this.restQuery(query);
    let rowCount = 0;
    if (queryResult[0]) rowCount = queryResult[0][0];
    return rowCount;
  }

  async dropDB() {
    await this.tdengineClient.exec(
      `DROP DATABASE ${AppConfig().timeseriesDb.dbName}`,
    );
  }

  async clearSuperTableData(superTableName: string) {
    superTableName = superTableName.replaceAll('-', '_');
    await this.tdengineClient.exec(`DELETE FROM ${superTableName}`);
  }

  async restQuery(query: string) {
    try {
      const response = await axios({
        method: 'POST',
        url: this.tdengineRestOptions.restUrl,
        headers: {
          'Content-Type': 'text/plain',
          Authorization: this.tdengineRestOptions.token,
        },
        data: query,
      });
      if (response.data?.data) {
        return response.data.data;
      } else {
        console.log(query);
        console.log(response.data);
        throw new Error('returned data from tdengine not valid');
      }
    } catch (err) {
      console.log('restQuery failed => ', err);
    }
  }

  async clearSuperTable(superTableName: string) {
    await this.tdengineClient.exec(`DELETE FROM  ${superTableName};`);
  }
}
