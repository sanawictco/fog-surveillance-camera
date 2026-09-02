import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import {
  InsertDataParams,
  TimeseriesRepositoryBase,
} from 'src/dddLib/infra/timeseriesRepository.base';

import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { MonotonicTimestampAllocator } from 'src/modules/shared/monotonicTimestamp';
import { TimeseriesRepository } from 'src/modules/shared/timeseriesRepository';
import {
  SYSTEM_LOG_ENTITY_ID_COLUMN_SIZE,
  SYSTEM_LOG_MESSAGE_KEYS_COLUMN_SIZE,
  SYSTEM_LOG_MESSAGE_PARAMS_COLUMN_SIZE,
  SYSTEM_LOG_SECTION_COLUMN_SIZE,
  SYSTEM_LOG_TENANT_ID_COLUMN_SIZE,
  SystemLogRecordFormat,
  SystemLogTypes,
  assertSystemLogTenantId,
  assertSystemLogTypes,
  systemLogColumnNames,
  systemLogColumnTypes,
  systemLogSubTableName,
  systemLogSuperTableName,
} from '../../domain/systemLog.type';

@Injectable()
export class SystemLogRepository
  extends TimeseriesRepository
  implements
    TimeseriesRepositoryBase<SystemLogRecordFormat>,
    OnApplicationBootstrap
{
  private readonly timestampAllocator = new MonotonicTimestampAllocator();
  private readonly ensuredStables = new Set<string>();

  constructor(serviceProvider: ServiceProvider) {
    super(serviceProvider);
  }

  /**
   * Creates fog's own tenant supertable and every known severity child table
   * at boot, so every later write is a plain INSERT and never a CREATE.
   */
  async onApplicationBootstrap(): Promise<void> {
    const tenantId = AppConfig().tenantId;
    await this.ensureSuperTable(tenantId);
    for (const type of Object.values(SystemLogTypes)) {
      await this.tdengineClient.exec(
        TimeSeriesDbExtension.createSubTableQuery({
          superTableName: systemLogSuperTableName(tenantId),
          subTableName: systemLogSubTableName(tenantId, type),
          tags: [
            { name: 'tenantId', value: tenantId },
            { name: 'groupId', value: type },
          ],
        }),
      );
    }
  }

  /**
   * Creates the tenant's own supertable once per process, mirroring
   * ActorLogRepository. `CREATE STABLE IF NOT EXISTS` keeps repeated boots
   * and replica races cheap. Public so read and cleanup paths can guarantee
   * the stable exists before querying it.
   */
  async ensureSuperTable(tenantId: string): Promise<void> {
    const superTableName = systemLogSuperTableName(tenantId);
    if (this.ensuredStables.has(superTableName)) return;
    await this.tdengineClient.exec(
      TimeSeriesDbExtension.createSuperTableQuery({
        superTableName,
        columnNames: systemLogColumnNames,
        columnDataTypes: systemLogColumnTypes,
        tags: [
          {
            name: 'tenantId',
            dataType: `VARCHAR(${SYSTEM_LOG_TENANT_ID_COLUMN_SIZE})`,
          },
          { name: 'groupId', dataType: 'VARCHAR(15)' },
        ],
      }),
    );
    this.ensuredStables.add(superTableName);
  }

  async insert(params: InsertDataParams<SystemLogRecordFormat>): Promise<void> {
    const { data } = params;
    const [tenantId, type, messageProps, section, entityId] = data;
    assertSystemLogTenantId(tenantId);
    assertSystemLogTypes([type]);
    const subTableName = systemLogSubTableName(tenantId, type);
    await this.ensureSuperTable(tenantId);
    const requestedTimestamp = params?.createdAt ?? Date.now();
    const createdAt = this.timestampAllocator.next(
      subTableName,
      requestedTimestamp,
    );
    const { superTableInsertFormat, subTableInsertFormat } =
      TimeSeriesDbExtension.getSuperTableAndSubTableInsertFormat(
        systemLogSuperTableName(tenantId),
        subTableName,
      );
    const messageParams = messageProps.params
      ? messageProps.params.join(',')
      : '';
    if (
      !Guard.isUnix(createdAt) ||
      !Guard.isBetween(tenantId, 1, SYSTEM_LOG_TENANT_ID_COLUMN_SIZE) ||
      !Guard.isBetween(
        messageProps.key,
        1,
        SYSTEM_LOG_MESSAGE_KEYS_COLUMN_SIZE,
      ) ||
      !Guard.isBetween(
        messageParams,
        0,
        SYSTEM_LOG_MESSAGE_PARAMS_COLUMN_SIZE,
      ) ||
      !Guard.isBetween(section, 1, SYSTEM_LOG_SECTION_COLUMN_SIZE) ||
      !Guard.isBetween(entityId, 1, SYSTEM_LOG_ENTITY_ID_COLUMN_SIZE)
    ) {
      throw new ArgumentInvalidException('invalid systemLog record : ' + data);
    }
    const values = TimeSeriesDbExtension.getValuesInsertFormat([
      createdAt,
      messageProps.key,
      messageParams,
      section,
      entityId,
    ]);
    const sql =
      `INSERT INTO ${subTableInsertFormat}
      USING ${superTableInsertFormat} (tenantId, groupId)` +
      ` TAGS (${TimeSeriesDbExtension.getValuesInsertFormat([tenantId, type])})` +
      ` (${systemLogColumnNames.join(', ')}) VALUES (${values});`;
    await this.tdengineClient.exec(sql);
  }

  async deleteAll(tenantId: string, entityId: string): Promise<void> {
    assertSystemLogTenantId(tenantId);
    await this.ensureSuperTable(tenantId);
    if (!Guard.isBetween(entityId, 1, SYSTEM_LOG_ENTITY_ID_COLUMN_SIZE)) {
      throw new ArgumentInvalidException('invalid system log entityId');
    }
    const entityFilter = TimeSeriesDbExtension.quoteStringLiteral(entityId);
    for (const type of Object.values(SystemLogTypes)) {
      const subTableName = systemLogSubTableName(tenantId, type);
      const deletedRecords: Array<[number | string]> = await this.findAll({
        superTableName: systemLogSuperTableName(tenantId),
        selectedColumns: ['createdAt'],
        filter:
          `tenantId=${TimeSeriesDbExtension.quoteStringLiteral(tenantId)} ` +
          `AND groupId=${TimeSeriesDbExtension.quoteStringLiteral(type)} ` +
          `AND entityId=${entityFilter}`,
      });
      const { subTableInsertFormat } =
        TimeSeriesDbExtension.getSuperTableAndSubTableInsertFormat(
          systemLogSuperTableName(tenantId),
          subTableName,
        );
      for (const [createdAt] of deletedRecords) {
        const timestamp = TimeSeriesDbExtension.getValuesInsertFormat([
          createdAt,
        ]);
        await this.tdengineClient.exec(
          `DELETE FROM ${subTableInsertFormat} WHERE createdAt=${timestamp};`,
        );
      }
    }
  }
}
