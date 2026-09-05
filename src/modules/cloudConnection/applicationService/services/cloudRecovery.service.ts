import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
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
import { CloudConnectionService } from './cloudConnection.service';
import { actorLogSuperTableName } from 'src/modules/actorLogs/domain/actorLog.type';
import { systemLogSuperTableName } from 'src/modules/systemLogs/domain/systemLog.type';
import { UpdateNvrCommand } from 'src/modules/videoDevices/applicationService/commands/nvr/updateNvr.command';
import { CloudFailedAt } from 'src/modules/videoDevices/domain/nvr/valueObjects/cloudFailedAt.vo';
import { ActorLogApiForCloudConnectionService } from 'src/modules/actorLogs/applicationService/services/actorLogApiForCloudConnectionservice';
import { SystemLogApiForCloudConnectionService } from 'src/modules/systemLogs/applicationService/apiForAnotherServices/systemLogApiForCloudConnection.service';

const BACKUP_ROOT = '/fog_shared_backups';
const BACKUP_ARCHIVE = `${BACKUP_ROOT}/backups.tar.zst`;
const MONGO_BACKUP_DIR = `${BACKUP_ROOT}/mongo`;
const TDENGINE_BACKUP_DIR = `${BACKUP_ROOT}/tdengine`;
const MONGO_BACKUP_SCRIPT =
  process.env.FOG_MONGO_BACKUP_SCRIPT ??
  join(process.cwd(), 'scripts', 'mongo-backup.sh');
const RECOVERY_STEP_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class CloudRecoveryService implements OnApplicationBootstrap {
  static RECOVERY_PROCESS_INITIALIZED = false;

  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly actorLogApiForCloudConnectionService: ActorLogApiForCloudConnectionService,
    private readonly systemLogApiForCloudConnectionService: SystemLogApiForCloudConnectionService,
  ) {}

  onApplicationBootstrap(): void {
    this.serviceProvider.eventEmitter.on(
      NvrEntity.getFogSubOnCloudMqttTopics().cloudRecoveryDataAck,
      this.getCloudRecoveryAck.bind(this),
    );
  }

  async startCloudRecoveryProcess(nvrEntity: NvrEntity): Promise<void> {
    if (CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED) return;
    CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = true;
    try {
      await this.cleanBackup();
      await this.createMongoBackup();
      await this.createTimeSeriesBackup(nvrEntity.getProps().cloudFailedAt);
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
      await this.serviceProvider.commandBus.execute(
        new UpdateNvrCommand({
          id: AppConfig().nvrId,
          cloudFailedAt: CloudFailedAt.init().unpack(),
        }),
      );
      CloudConnectionService.CLOUD_IS_AVAILABLE = true;
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      await this.cleanBackup();
      // Acking means the cloud has imported the whole archive, including the
      // time-series statements; the cloud completes recovery only after both
      // the Mongo and TDengine imports succeed. Clearing the local audit
      // trail here can therefore never lose data the cloud doesn't already
      // have.
      await this.actorLogApiForCloudConnectionService.clearData();
      await this.systemLogApiForCloudConnectionService.clearData();
    } catch (error) {
      this.serviceProvider.eventEmitter.emit(GLOBAL_ERROR_EVENT, error);
    }
  }

  private async createMongoBackup(): Promise<void> {
    await fs.promises.mkdir(MONGO_BACKUP_DIR, { recursive: true });
    await this.runCommand('bash', [MONGO_BACKUP_SCRIPT], this.mongoBackupEnv());
  }

  /**
   * Dumps this tenant's own actor/system supertables with TDengine's native
   * taosdump, incrementally from the moment cloud contact was lost. A failure
   * propagates: uploading a mongo-only archive would get acked, and the ack
   * triggers clearData() — destroying local logs that were never backed up.
   */
  private async createTimeSeriesBackup(cloudFailedAt: number): Promise<void> {
    await fs.promises.mkdir(TDENGINE_BACKUP_DIR, { recursive: true });
    const tenantId = AppConfig().tenantId;
    await this.runCommand('taosdump', [
      '-h', process.env.TIME_SERIES_DB_HOST ?? 'tdengine-fog',
      '-P', process.env.TIME_SERIES_DB_NATIVE_PORT ?? '6030',
      '-u', process.env.TIME_SERIES_DB_USER ?? 'root',
      `-p${process.env.TIME_SERIES_DB_PASSWORD ?? ''}`,
      // Mandatory: fog's database name contains a hyphen, which taosdump
      // otherwise emits unescaped, failing with "Database not specified".
      '-e',
      AppConfig().timeseriesDb.dbName,
      actorLogSuperTableName(tenantId),
      systemLogSuperTableName(tenantId),
      '-S', String(cloudFailedAt),
      '-o', TDENGINE_BACKUP_DIR,
      // taosdump unconditionally writes a result log; point it at the backup
      // dir (already chown'd to the node user) instead of the process cwd,
      // which the unprivileged node user may not be able to write to.
      '-r', `${TDENGINE_BACKUP_DIR}/dump_result.txt`,
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
