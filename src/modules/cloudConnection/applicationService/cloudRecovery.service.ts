import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
} from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';
import AppConfig from 'configs/app.config';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { GLOBAL_ERROR_EVENT } from 'src/utilities/exception.filter';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { MqttEventDataDto } from 'src/extensions/mqtt/dtos/mqttEventData.dto';
import { CloudConnectionService } from './services/cloudConnection.service';
import { TimeSeriesDbExtension } from 'src/dddLib/utils/timeSeriesDbExtension';
import { ACTOR_LOG_REPOSITORY } from 'src/modules/actorLogs/infra/actorLog.diToken';
import type { ActorLogRepository } from 'src/modules/actorLogs/infra/actorLog.timeseriesRepository';
import { actorLogSuperTableName } from 'src/modules/actorLogs/domain/actorLog.type';
import { SYSTEM_LOG_REPOSITORY } from 'src/modules/systemLogs/infra/diToken/systemLog.diToken';
import type { SystemLogRepository } from 'src/modules/systemLogs/infra/repositories/systemLog.timeseriesRepository';
import { systemLogSuperTableName } from 'src/modules/systemLogs/domain/systemLog.type';

const BACKUP_ROOT = '/fog_shared_backups';
const BACKUP_ARCHIVE = `${BACKUP_ROOT}/backups.tar.zst`;
const MONGO_BACKUP_DIR = `${BACKUP_ROOT}/mongo`;
const TDENGINE_BACKUP_DIR = `${BACKUP_ROOT}/tdengine`;
const TDENGINE_BACKUP_FILE = `${TDENGINE_BACKUP_DIR}/dbs.sql`;
const MONGO_BACKUP_SCRIPT =
  process.env.FOG_MONGO_BACKUP_SCRIPT ??
  join(process.cwd(), 'scripts', 'mongo-backup.sh');
const RECOVERY_STEP_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class CloudRecoveryService implements OnApplicationBootstrap {
  static RECOVERY_PROCESS_INITIALIZED = false;

  constructor(
    private readonly serviceProvider: ServiceProvider,
    @Inject(ACTOR_LOG_REPOSITORY)
    private readonly actorLogRepository: ActorLogRepository,
    @Inject(SYSTEM_LOG_REPOSITORY)
    private readonly systemLogRepository: SystemLogRepository,
  ) {}

  onApplicationBootstrap(): void {
    this.serviceProvider.eventEmitter.on(
      NvrEntity.getFogSubOnCloudMqttTopics().cloudRecoveryDataAck,
      this.getCloudRecoveryAck.bind(this),
    );
  }

  async startCloudRecoveryProcess(_nvrEntity: NvrEntity): Promise<void> {
    if (CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED) return;
    CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = true;
    try {
      await this.cleanBackup();
      await this.createMongoBackup();
      await this.createTimeSeriesBackup();
      await this.compressBackup();
      await this.uploadBackup();
    } catch (error) {
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      this.serviceProvider.logger.error('Fog cloud recovery failed', error);
    }
  }

  async getCloudRecoveryAck(_mqttMsg: MqttEventDataDto): Promise<void> {
    if (!CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED) return;
    try {
      CloudConnectionService.CLOUD_IS_AVAILABLE = true;
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      await this.cleanBackup();
      // Acking means the cloud has imported the whole archive, including the
      // time-series statements; the cloud completes recovery only after both
      // the Mongo and TDengine imports succeed.
    } catch (error) {
      this.serviceProvider.eventEmitter.emit(GLOBAL_ERROR_EVENT, error);
    }
  }

  private async createMongoBackup(): Promise<void> {
    await fs.promises.mkdir(MONGO_BACKUP_DIR, { recursive: true });
    await this.runCommand('bash', [MONGO_BACKUP_SCRIPT], this.mongoBackupEnv());
  }

  /**
   * Exports local actor/system log rows as one v1 INSERT statement per line
   * into tdengine/dbs.sql — the archive member the cloud tenant-scoped
   * importer consumes. Export failures are logged and skipped: a mongo-only
   * archive stays importable and the local logs remain in TDengine for the
   * next recovery attempt.
   */
  private async createTimeSeriesBackup(): Promise<void> {
    await fs.promises.mkdir(TDENGINE_BACKUP_DIR, { recursive: true });
    try {
      const statements = await this.exportTimeSeriesInserts();
      await fs.promises.writeFile(
        TDENGINE_BACKUP_FILE,
        statements.length ? `${statements.join('\n')}\n` : '',
      );
    } catch (error) {
      this.serviceProvider.logger.error(
        'Fog time-series backup failed; archive continues without it',
        error,
      );
    }
  }

  /**
   * Exports rows from fog's own tenant stables in cloud's two-tag insert
   * form, so the statements replay unchanged against cloud's per-tenant
   * stables during restore. Severity (`groupId`) lives only as a tag on
   * system-log rows, so it must be selected explicitly alongside the columns.
   */
  private async exportTimeSeriesInserts(): Promise<string[]> {
    const dbName = AppConfig().timeseriesDb.dbName;
    const tenantId = AppConfig().tenantId;
    const actorSuperTable = actorLogSuperTableName(tenantId);
    const systemSuperTable = systemLogSuperTableName(tenantId);
    const actorRows = await this.actorLogRepository.restQuery(
      `SELECT tbname, createdAt, actorLogType, actorId, messageKey, messageParams ` +
        `FROM ${dbName}.${actorSuperTable}`,
    );
    const systemRows = await this.systemLogRepository.restQuery(
      `SELECT tbname, createdAt, messageKey, messageParams, section, entityId, groupId ` +
        `FROM ${dbName}.${systemSuperTable}`,
    );
    if (!actorRows || !systemRows) {
      throw new Error('Fog time-series export query failed');
    }
    const statements: string[] = [];
    for (const row of actorRows) {
      const [tbname, createdAt, actorLogType, actorId, messageKey, messageParams] =
        row.map(this.exportCellValue);
      statements.push(
        `INSERT INTO ${dbName}.\`${tbname}\` ` +
          `USING ${dbName}.${actorSuperTable} (tenantId, actorId) ` +
          `TAGS (${TimeSeriesDbExtension.getValuesInsertFormat([tenantId, actorId])}) ` +
          `VALUES (${this.actorLogValues(createdAt, actorLogType, messageKey, messageParams)});`,
      );
    }
    for (const row of systemRows) {
      const [tbname, createdAt, messageKey, messageParams, section, entityId, groupId] =
        row.map(this.exportCellValue);
      statements.push(
        `INSERT INTO ${dbName}.\`${tbname}\` ` +
          `USING ${dbName}.${systemSuperTable} (tenantId, groupId) ` +
          `TAGS (${TimeSeriesDbExtension.getValuesInsertFormat([tenantId, groupId])}) ` +
          `VALUES (${this.systemLogValues(createdAt, messageKey, messageParams, section, entityId)});`,
      );
    }
    return statements;
  }

  private exportCellValue(value: unknown): string {
    return String(value ?? '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/`/g, '');
  }

  /**
   * actorId is intentionally absent here: it is a TAG on the stable, not a
   * stored column (TDengine rejects a tag name that duplicates a column
   * name), so it is supplied only in the INSERT statement's TAGS clause.
   */
  private actorLogValues(
    createdAt: unknown,
    actorLogType: unknown,
    messageKey: unknown,
    messageParams: unknown,
  ): string {
    return TimeSeriesDbExtension.getValuesInsertFormat([
      Number(createdAt),
      String(actorLogType ?? ''),
      String(messageKey ?? ''),
      String(messageParams ?? ''),
    ]);
  }

  private systemLogValues(
    createdAt: unknown,
    messageKey: unknown,
    messageParams: unknown,
    section: unknown,
    entityId: unknown,
  ): string {
    return TimeSeriesDbExtension.getValuesInsertFormat([
      Number(createdAt),
      String(messageKey ?? ''),
      String(messageParams ?? ''),
      String(section ?? ''),
      String(entityId ?? ''),
    ]);
  }

  private mongoBackupEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      MONGO_BACKUP_HOST: process.env.MONGO_DB_HOST,
      MONGO_BACKUP_PORT: process.env.MONGO_DB_PORT,
      MONGO_BACKUP_DB: process.env.MONGO_DB_NAME,
      MONGO_BACKUP_USER: process.env.MONGO_DB_USERNAME ?? '',
      MONGO_BACKUP_PASSWORD: process.env.MONGO_DB_PASSWORD ?? '',
      MONGO_BACKUP_AUTHDB: process.env.MONGO_DB_AUTH_SOURCE ?? 'admin',
      MONGO_BACKUP_DIR: MONGO_BACKUP_DIR,
    };
  }

  private async compressBackup(): Promise<void> {
    await this.runCommand('tar', [
      '-I',
      'zstd -12',
      '-cf',
      BACKUP_ARCHIVE,
      '-C',
      BACKUP_ROOT,
      'mongo',
      'tdengine',
    ]);
  }

  private async uploadBackup(): Promise<void> {
    const data = new FormData();
    data.append('file', fs.createReadStream(BACKUP_ARCHIVE));
    await axios.request({
      method: 'post',
      maxBodyLength: Infinity,
      timeout: 0,
      url: `${AppConfig().cloudHttpUrl}/fog-communication-manager/restore-fog-backup-to-cloud`,
      headers: {
        ...data.getHeaders(),
        'X-Tenant-Id': AppConfig().tenantId,
        'X-Nvr-Serial-Number': AppConfig().nvrSerialNumber,
        'X-Nvr-Access-Token': AppConfig().nvrAccessToken,
      },
      data,
    });
  }

  private async cleanBackup(): Promise<void> {
    await Promise.all(
      [MONGO_BACKUP_DIR, TDENGINE_BACKUP_DIR, BACKUP_ARCHIVE].map((target) =>
        fs.promises.rm(target, { recursive: true, force: true }),
      ),
    );
  }

  private runCommand(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      let settled = false;
      const timeout = setTimeout(
        () => child.kill('SIGKILL'),
        RECOVERY_STEP_TIMEOUT_MS,
      );
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > 1024 * 1024) child.kill('SIGKILL');
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`${command} failed: ${stderr || `exit ${code}`}`));
      });
    });
  }
}
