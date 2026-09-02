import { Inject, Injectable } from '@nestjs/common';
import type { WsSql } from '@tdengine/websocket';
import axios from 'axios';
import AppConfig from 'configs/app.config';
import {
  OrderStates,
  PaginatedTimeseriesQueryBase,
} from 'src/dddLib/applicationService';
import { Paginated } from 'src/dddLib/infra';
import {
  CountDataParams,
  CreateSubTableParams,
  FindDataParams,
} from 'src/dddLib/infra/timeseriesRepository.base';
import { ObjectExtension } from 'src/dddLib/utils/objectExtension';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';

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
export class TimeseriesRepository {
  @Inject(TDENGINE_CLIENT) protected readonly tdengineClient!: WsSql;
  @Inject(TDENGINE_RESTFULL_OPTIONS)
  protected readonly tdengineRestOptions!: TdengineRestOptions;
  constructor(private readonly serviceProvider: ServiceProvider) {}

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
      throw new Error('params in find method is empty');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const query = TimeSeriesDbExtension.createFindAllQuery(params);
    return await this.restQuery(query);
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
    if (!params.orderBy) {
      params.orderBy = { column: 'createdAt', status: OrderStates.DESCENDING };
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    const query = TimeSeriesDbExtension.createFindAllQuery(params);
    const data: any = await this.restQuery(query);
    return {
      totalDocs: await this.count({
        superTableName: params.superTableName,
        subTableName: params.subTableName,
        timeRangeInUnix: params.timeRangeInUnix,
        filter: params.filter,
      }),
      page: params.page,
      limit: params.limit,
      docs: data,
    };
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

  /**
   * Public: called directly by cloudRecovery.service.ts (time-series backup
   * export) and deleteNvr.command.ts, not only through this class.
   */
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
      if (Array.isArray(response.data?.data)) {
        return response.data.data;
      }
      throw new Error('returned data from tdengine not valid');
    } catch (err) {
      console.log('restQuery failed => ', err);
      throw err;
    }
  }

  async clearSuperTable(superTableName: string) {
    await this.tdengineClient.exec(`DELETE FROM  ${superTableName};`);
  }

  async clearDatabase(): Promise<void> {
    try {
      const dbName = AppConfig().timeseriesDb.dbName;
      // Get all supertables
      const result = await this.tdengineClient.query(
        `SELECT stable_name FROM information_schema.ins_stables WHERE db_name = '${dbName}'`,
      );

      const stables = (result as any).data || [];

      // Drop each supertable
      for (const row of stables) {
        const stableName = row[0];
        await this.tdengineClient.exec(
          `DROP STABLE IF EXISTS ${dbName}.${stableName}`,
        );
      }

      this.serviceProvider.logger.log(
        `Cleared ${stables.length} supertables from ${dbName}`,
      );
    } finally {
      await this.tdengineClient.close();
    }
  }
}
