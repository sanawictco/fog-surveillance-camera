import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import axios from 'axios';
import AppConfig from 'configs/app.config';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { GLOBAL_ERROR_EVENT } from 'src/utilities/exception.filter';
import { CloudConnectionService } from './services/cloudConnection.service';
import { ActorLogApiForCloudConnectionService } from 'src/modules/actorLogs/applicationService/services/actorLogApiForCloudConnectionservice';
import { SystemLogApiForCloudConnectionService } from 'src/modules/systemLogs/applicationService/services/systemLogApiForCloudConnection.service';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { UpdateNvrCommand } from 'src/modules/videoDevices/applicatonService/commands/nvr/updateNvr.command';
import { CloudFailedAt } from 'src/modules/videoDevices/domain/nvr/valueObjects/cloudFailedAt.vo';
import { MqttEventDataDto } from 'src/extensions/mqtt/dtos/mqttEventData.dto';
import * as fs from 'node:fs';
import Docker = require('dockerode');
import FormData from 'form-data';

const docker = new Docker();
@Injectable()
export class CloudRecoveryService implements OnApplicationBootstrap {
  static RECOVERY_PROCESS_INITIALIZED = false;
  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly systemLogApiForCloudConnection: SystemLogApiForCloudConnectionService,
    private readonly actorLogApiForCloudConnectionService: ActorLogApiForCloudConnectionService,
  ) {}
  onApplicationBootstrap() {
    this.serviceProvider.eventEmitter.on(
      NvrEntity.getFogSubOnCloudMqttTopics().cloudRecoveryDataAck,
      this.getCloudRecovertAck.bind(this),
    );
  }
  async startCloudRecoveryProcess(nvrEntity: NvrEntity) {
    try {
      if (CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED) return;
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = true;
      const cloudFailedAt: number = nvrEntity.getProps().cloudFailedAt;
      await this.cleanBackup();
      await this.createMongoBackup();
      await this.createTdengineBackup(cloudFailedAt);
      await this.compressBackup();
      await this.uploadBackup();
    } catch (err) {
      console.log('error in startCloudRecoveryProcess', err);
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      this.serviceProvider.eventEmitter.emit(GLOBAL_ERROR_EVENT, err);
    }
  }

  async getCloudRecovertAck(_mqttMsg: MqttEventDataDto) {
    try {
      console.log('finish cloud recovery***********************');
      await this.serviceProvider.commandBus.execute(
        new UpdateNvrCommand({
          id: AppConfig().nvrId,
          cloudFailedAt: CloudFailedAt.init().unpack(),
        }),
      );
      CloudConnectionService.CLOUD_IS_AVAILABLE = true;
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      await this.cleanBackup();
      await this.actorLogApiForCloudConnectionService.clearData();
      await this.systemLogApiForCloudConnection.clearData();
    } catch (err) {
      this.serviceProvider.eventEmitter.emit(GLOBAL_ERROR_EVENT, err);
    }
  }

  private async createMongoBackup() {
    try {
      const backupPath = '/fog_shared_backups/mongo';
      if (!fs.existsSync(backupPath))
        fs.mkdirSync(backupPath, { recursive: true });
      const backupScriptPath = '/fog_shared_backups/mongo-backup.sh';
      const mongoContainerName = 'mongo-fog';
      const containers = await docker.listContainers({ all: true });
      const mongoContainerInfo = containers.find((c) =>
        c.Names.includes(`/${mongoContainerName}`),
      );

      if (!mongoContainerInfo) {
        throw new Error(`Container "${mongoContainerName}" not found`);
      }

      const mongoContainer = docker.getContainer(mongoContainerInfo.Id);

      // Create the exec command for mongo and tdengine
      const exec = await mongoContainer.exec({
        Cmd: ['bash', backupScriptPath],
        AttachStdout: true,
        AttachStderr: true,
      });

      // Start the exec command and get the stream
      const stream = await exec.start({ hijack: true, stdin: false });

      // Handle output without blocking event loop
      mongoContainer.modem.demuxStream(stream, process.stdout, process.stderr);

      // Wait for completion
      await new Promise((resolve, reject) => {
        stream.on('end', () => resolve('completed'));
        stream.on('error', reject);
        setTimeout(
          () => reject(new Error('Mongo backup timeout exceeded')),
          60000,
        ); // 1 minute timeout
      });

      // Check exit code
      const inspect = await exec.inspect();
      if (inspect.ExitCode !== 0) {
        throw new Error(`mongo backup failed with code ${inspect.ExitCode}`);
      }

      return { success: true, message: 'mongo backup completed successfully' };
    } catch (error) {
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      console.error('Error during mongo backup:', error);
      throw error;
    }
  }

  private async createTdengineBackup(cloudFailedAtInUnix: number) {
    try {
      const backupPath = '/fog_shared_backups/tdengine';
      if (!fs.existsSync(backupPath))
        fs.mkdirSync(backupPath, { recursive: true });
      const tdengineContainerName = 'tdengine-fog';
      const containers = await docker.listContainers({ all: true });
      const tdengineContainerInfo = containers.find((c) =>
        c.Names.includes(`/${tdengineContainerName}`),
      );

      if (!tdengineContainerInfo) {
        throw new Error(`Container "${tdengineContainerName}" not found`);
      }

      const tdengineContainer = docker.getContainer(tdengineContainerInfo.Id);

      // Create the exec command for tdengine and tdengine
      const exec = await tdengineContainer.exec({
        Cmd: [
          'taosdump',
          '-D',
          AppConfig().timeseriesDb.dbName,
          '-o',
          backupPath,
          '-S',
          `${cloudFailedAtInUnix}`,
        ],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      tdengineContainer.modem.demuxStream(
        stream,
        process.stdout,
        process.stderr,
      );

      await new Promise((resolve, reject) => {
        stream.on('end', () => resolve('completed'));
        stream.on('error', reject);
        setTimeout(
          () => reject(new Error('Tdengine backup timeout exceeded')),
          60000,
        ); // 1 minute timeout
      });

      // Check exit code
      const inspect = await exec.inspect();
      if (inspect.ExitCode !== 0) {
        throw new Error(`tdengine backup failed with code ${inspect.ExitCode}`);
      }

      return {
        success: true,
        message: 'tdengine backup completed successfully',
      };
    } catch (error) {
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      console.error('Error during tdengine backup:', error);
      throw error;
    }
  }

  private async compressBackup() {
    try {
      const backupPath = '/fog_shared_backups';
      const mongoContainerName = 'mongo-fog';
      const containers = await docker.listContainers({ all: true });
      const mongoContainerInfo = containers.find((c) =>
        c.Names.includes(`/${mongoContainerName}`),
      );

      if (!mongoContainerInfo) {
        throw new Error(`Container "${mongoContainerName}" not found`);
      }

      const mongoContainer = docker.getContainer(mongoContainerInfo.Id);

      const exec = await mongoContainer.exec({
        Cmd: [
          'tar',
          '-I',
          'zstd -12',
          '-cf',
          `${backupPath}/backups.tar.zst`,
          `${backupPath}/mongo`,
          `${backupPath}/tdengine`,
        ],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      mongoContainer.modem.demuxStream(stream, process.stdout, process.stderr);

      await new Promise((resolve, reject) => {
        stream.on('end', () => resolve('completed'));
        stream.on('error', reject);
        setTimeout(
          () => reject(new Error('Compress backups timeout exceeded')),
          60000,
        ); // 1 minute timeout
      });

      // Check exit code
      const inspect = await exec.inspect();
      if (inspect.ExitCode !== 0) {
        throw new Error(
          `backup files compression failed with code ${inspect.ExitCode}`,
        );
      }

      return {
        success: true,
        message: 'backup files compression completed successfully',
      };
    } catch (error) {
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      console.error('Error during backup files compression:', error);
      throw error;
    }
  }

  private async uploadBackup() {
    try {
      const backupPath = '/fog_shared_backups';
      const data = new FormData();
      data.append('file', fs.createReadStream(`${backupPath}/backups.tar.zst`));
      data.append('accessToken', AppConfig().nvrAccessToken);
      data.append('serialNumber', AppConfig().nvrSerialNumber);

      const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${AppConfig().cloudHttpUrl}/fog-communication-manager/restore-fog-backup-to-cloud`,
        headers: {
          ...data.getHeaders(),
        },
        data: data,
      };

      const response = await axios.request(config);
      console.log(JSON.stringify(response.data));
    } catch (err) {
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      console.error('Error during backup upload:', err);
      throw err;
    }
  }

  private async cleanBackup(): Promise<
    { success: boolean; message: string } | undefined
  > {
    try {
      const backupPath = '/fog_shared_backups';
      const mongoContainerName = 'mongo-fog';
      const containers = await docker.listContainers({ all: true });
      const mongoContainerInfo = containers.find((c) =>
        c.Names.includes(`/${mongoContainerName}`),
      );

      if (!mongoContainerInfo) {
        throw new Error(`Container "${mongoContainerName}" not found`);
      }

      const mongoContainer = docker.getContainer(mongoContainerInfo.Id);

      const exec = await mongoContainer.exec({
        Cmd: [
          'rm',
          '-rf',
          `${backupPath}/mongo`,
          `${backupPath}/tdengine`,
          `${backupPath}/backups.tar.zst`,
        ],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      mongoContainer.modem.demuxStream(stream, process.stdout, process.stderr);

      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
        setTimeout(() => reject(new Error('Timeout exceeded')), 60000); // 1 minute timeout
      });

      // Check exit code
      const inspect = await exec.inspect();
      if (inspect.ExitCode !== 0) {
        throw new Error(
          `backup files cleaning failed with code ${inspect.ExitCode}`,
        );
      }

      return {
        success: true,
        message: 'clean backup completed successfully',
      };
    } catch (err) {
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      console.log(err);
      return undefined;
    }
  }
}
