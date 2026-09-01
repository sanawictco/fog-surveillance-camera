import { Injectable } from '@nestjs/common';
import {
  DeleteDataParams,
  InsertDataParams,
  TimeseriesRepositoryBase,
  UpdateDataParams,
} from 'src/dddLib/infra/timeseriesRepository.base';

import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import { TimeseriesRepository } from 'src/modules/shared/timeseriesRepository';
import {
  SYSTEM_LOG_ENTITY_ID_COLUMN_SIZE,
  SYSTEM_LOG_MESSAGE_KEYS_COLUMN_SIZE,
  SYSTEM_LOG_MESSAGE_PARAMS_COLUMN_SIZE,
  SYSTEM_LOG_SECTION_COLUMN_SIZE,
  SYSTEM_LOG_SUPER_TABLE,
  SystemLogRecordFormat,
} from '../../domain/systemLog.type';

@Injectable()
export class SystemLogRepository
  extends TimeseriesRepository
  implements TimeseriesRepositoryBase<SystemLogRecordFormat>
{
  constructor() {
    super();
  }

  async insert(params: InsertDataParams<SystemLogRecordFormat>): Promise<void> {
    const { superTableName, subTableName, data } = params;
    const { superTableInsertFormat, subTableInsertFormat } =
      TimeSeriesDbExtension.getSuperTableAndSubTableInsertFormat(
        superTableName!,
        subTableName!,
      );
    const createdAt = params?.createdAt ?? new Date().getTime();
    const messageParams = data[0]?.params ? data[0].params.join(',') : '';
    if (
      !Guard.isUnix(createdAt) ||
      !Guard.isBetween(data[0]?.key, 0, SYSTEM_LOG_MESSAGE_KEYS_COLUMN_SIZE) ||
      !Guard.isBetween(
        messageParams,
        0,
        SYSTEM_LOG_MESSAGE_PARAMS_COLUMN_SIZE,
      ) ||
      !Guard.isBetween(data[1], 0, SYSTEM_LOG_SECTION_COLUMN_SIZE) ||
      !Guard.isBetween(data[2], 0, SYSTEM_LOG_ENTITY_ID_COLUMN_SIZE)
    ) {
      throw new ArgumentInvalidException('invalid systemLog record : ' + data);
    }
    const values = TimeSeriesDbExtension.getValuesInsertFormat([
      createdAt,
      data[0].key,
      messageParams,
      data[1],
      data[2],
    ]);
    const sql =
      `INSERT INTO ${subTableInsertFormat} 
    USING ${superTableInsertFormat}` +
      ` TAGS ('${subTableName}') VALUES (${values});`;
    await this.tdengineClient.exec(sql);
  }

  async delete(params: DeleteDataParams): Promise<void> {
    const { superTableName, createdAt } = params;
    const sql = `DELETE FROM ${superTableName} WHERE createdAt = ${createdAt}`;
    await this.tdengineClient.exec(sql);
  }

  async deleteAll(entityId: string): Promise<void> {
    const deletedRecords: string[] = await this.findAll({
      superTableName: SYSTEM_LOG_SUPER_TABLE,
      selectedColumns: ['createdAt'],
      filter: `entityId="${entityId}"`,
    });
    for (const deletedRecord of deletedRecords) {
      const sql = `DELETE FROM ${SYSTEM_LOG_SUPER_TABLE} WHERE createdat="${deletedRecord[0]}";`;
      await this.tdengineClient.exec(sql);
    }
  }

  async update(params: UpdateDataParams<SystemLogRecordFormat>): Promise<void> {
    const { superTableName, subTableName, data, createdAt } = params;
    const deleteDataParams = { superTableName, createdAt };
    const insertDataParams = { superTableName, subTableName, data };
    await this.delete(deleteDataParams);
    await this.insert(insertDataParams);
  }
}
