import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import {
  InsertDataParams,
  TimeseriesRepositoryBase,
} from 'src/dddLib/infra/timeseriesRepository.base';
import {
  ACTOR_LOG_ACTOR_ID_COLUMN_SIZE,
  ACTOR_LOG_ACTOR_LOG_TYPE_COLUMN_SIZE,
  ACTOR_LOG_MESSAGE_KEY_COLUMN_SIZE,
  ACTOR_LOG_MESSAGE_PARAMS_COLUMN_SIZE,
  ACTOR_LOG_TENANT_ID_COLUMN_SIZE,
  ActorLogRecordFormat,
  SANAW_KIOSK_USER_ID,
  assertActorLogId,
  assertActorLogTenantId,
  assertActorLogTypes,
  actorLogColumnNames,
  actorLogColumnTypes,
  actorLogSubTableName,
  actorLogSuperTableName,
} from '../domain/actorLog.type';

import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { MonotonicTimestampAllocator } from 'src/modules/shared/monotonicTimestamp';
import { TimeseriesRepository } from 'src/modules/shared/timeseriesRepository';

@Injectable()
export class ActorLogRepository
  extends TimeseriesRepository
  implements TimeseriesRepositoryBase<ActorLogRecordFormat>, OnApplicationBootstrap
{
  private readonly timestampAllocator = new MonotonicTimestampAllocator();
  private readonly ensuredStables = new Set<string>();

  constructor(serviceProvider: ServiceProvider) {
    super(serviceProvider);
  }

  /**
   * Creates fog's own tenant supertable and its one known child table (the
   * kiosk actor — fog has no other actor) at boot, so every later write is a
   * plain INSERT and never a CREATE.
   */
  async onApplicationBootstrap(): Promise<void> {
    const tenantId = AppConfig().tenantId;
    await this.ensureSuperTable(tenantId);
    await this.tdengineClient.exec(
      TimeSeriesDbExtension.createSubTableQuery({
        superTableName: actorLogSuperTableName(tenantId),
        subTableName: actorLogSubTableName(tenantId, SANAW_KIOSK_USER_ID),
        tags: [
          { name: 'tenantId', value: tenantId },
          { name: 'actorId', value: SANAW_KIOSK_USER_ID },
        ],
      }),
    );
  }

  /**
   * Creates the tenant's own supertable once per process. `CREATE STABLE IF
   * NOT EXISTS` keeps repeated boots cheap.
   */
  private async ensureSuperTable(tenantId: string): Promise<void> {
    const superTableName = actorLogSuperTableName(tenantId);
    if (this.ensuredStables.has(superTableName)) return;
    await this.tdengineClient.exec(
      TimeSeriesDbExtension.createSuperTableQuery({
        superTableName,
        columnNames: actorLogColumnNames,
        columnDataTypes: actorLogColumnTypes,
        tags: [
          {
            name: 'tenantId',
            dataType: `VARCHAR(${ACTOR_LOG_TENANT_ID_COLUMN_SIZE})`,
          },
          {
            name: 'actorId',
            dataType: `NCHAR(${ACTOR_LOG_ACTOR_ID_COLUMN_SIZE})`,
          },
        ],
      }),
    );
    this.ensuredStables.add(superTableName);
  }

  /**
   * Writes one actor event to the (tenant, actor) child table. The stable and
   * child names are always derived server-side from validated UUIDs;
   * caller-supplied table names are ignored, so a caller can never select
   * another tenant's or actor's table. Tags carry the tenant and actor so
   * stable-level reads stay filterable.
   */
  async insert(params: InsertDataParams<ActorLogRecordFormat>): Promise<void> {
    const { data } = params;
    const [tenantId, actorType, actorId, messageProps] = data;
    assertActorLogTenantId(tenantId);
    assertActorLogTypes([actorType]);
    assertActorLogId(actorId);
    const subTableName = actorLogSubTableName(tenantId, actorId);
    await this.ensureSuperTable(tenantId);
    const requestedTimestamp = params?.createdAt ?? Date.now();
    const createdAt = this.timestampAllocator.next(
      subTableName,
      requestedTimestamp,
    );
    const messageParams = messageProps.params
      ? messageProps.params.join(',')
      : '';
    if (
      !Guard.isUnix(createdAt) ||
      !Guard.isBetween(actorId, 1, ACTOR_LOG_ACTOR_ID_COLUMN_SIZE) ||
      !Guard.isBetween(actorType, 1, ACTOR_LOG_ACTOR_LOG_TYPE_COLUMN_SIZE) ||
      !Guard.isBetween(
        messageProps.key,
        1,
        ACTOR_LOG_MESSAGE_KEY_COLUMN_SIZE,
      ) ||
      !Guard.isBetween(messageParams, 0, ACTOR_LOG_MESSAGE_PARAMS_COLUMN_SIZE)
    ) {
      throw new ArgumentInvalidException(
        'invalid actorLog timeseries record : ' + JSON.stringify(data),
      );
    }
    const { superTableInsertFormat, subTableInsertFormat } =
      TimeSeriesDbExtension.getSuperTableAndSubTableInsertFormat(
        actorLogSuperTableName(tenantId),
        subTableName,
      );
    const values = TimeSeriesDbExtension.getValuesInsertFormat([
      createdAt,
      actorType,
      messageProps.key,
      messageParams,
    ]);
    const sql =
      `INSERT INTO ${subTableInsertFormat}
      USING ${superTableInsertFormat} (tenantId, actorId)` +
      ` TAGS (${TimeSeriesDbExtension.getValuesInsertFormat([tenantId, actorId])})` +
      ` (${actorLogColumnNames.join(', ')}) VALUES (${values});`;
    await this.tdengineClient.exec(sql);
  }

  /**
   * Removes one actor's entire history by dropping their child table inside
   * the tenant's own supertable — one instant statement, tenant-scoped by
   * construction.
   */
  async dropByActor(tenantId: string, actorId: string): Promise<void> {
    assertActorLogTenantId(tenantId);
    assertActorLogId(actorId);
    const { subTableInsertFormat } =
      TimeSeriesDbExtension.getSuperTableAndSubTableInsertFormat(
        actorLogSuperTableName(tenantId),
        actorLogSubTableName(tenantId, actorId),
      );
    await this.tdengineClient.exec(
      `DROP TABLE IF EXISTS ${subTableInsertFormat};`,
    );
  }
}
